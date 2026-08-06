// OpenDRIVE 1.8 (.xodr) exporter — emits a road network from a snapshot.
// No external library dependencies.
//
// Design:
// - Laterally adjacent same-direction lanes (detected through shared boundary
//   linestrings) are grouped into one road bundle and emitted as a single
//   <road> with lanes -1, -2, ... (inner to outer)
// - The road reference line is the bundle's leftmost boundary (the left edge
//   in travel direction), so lane 0 sits on it and no laneOffset is needed
// - The reference polyline is fitted into analytic primitives (<line>, <arc>,
//   <paramPoly3>) by odrGeometryFit; lane widths are piecewise-linear <width>
//   records measured along the fitted reference normals (the exact inverse of
//   the importer's offset-along-normal reconstruction)
// - Lane connectivity (next/prev) is written into road/lane <link> records;
//   branch/merge edges that road links cannot express are synthesized into
//   <junction> elements with short connecting roads (one per lane edge, each
//   carrying predecessor/successor road links) so the standard
//   incoming -> connecting -> outgoing structure holds (see planConnectivity)
// - Lanelet-only lane tags are stashed per lane in
//   <userData code="laneAttributes"> and restored on import; signal validity
//   uses <validity fromLane toLane> lane ranges within a road and
//   <signalReference> only when a signal spans several roads
// - Coordinate frame: canvas (x right, y down) → ENU (x right, y up); y is flipped

import type {
  BaseShape,
  CrosswalkProps,
  DrawtonomySnapshot,
  LaneProps,
  LinestringProps,
  PointProps,
  PolygonProps,
  TrafficLightProps,
  TrafficSignProps,
} from '../types'
import { sampleAtParam, type Point2D } from './laneCenterline'
import { evalGeometry } from './odrGeometry'
import { fitPlanView, type FittedSamplePose } from './odrGeometryFit'
import { fitElevationProfile, type ElevationSample } from './odrElevationFit'
import type { OdrGeometry } from './opendriveParser'
import { originToProjString } from './projection'
import { escapeXml, fmt, fmtPrecise, pxToEnuX, pxToEnuY, pxToMeter } from './units'
import {
  extractOdrDocument,
  hashRoadState,
  rewriteRoadLinkTargets,
  type CarryLaneState,
  type CarryRegulatoryState,
  type OdrDocRoad,
  type OdrDocument,
  type OdrRoadRecord,
} from './odrCarryThrough'
import type { OdrSidecar } from './odrToShapes'
import { trafficSignCode } from './lanelet2'

type LaneShape = BaseShape<'lane', LaneProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>
type TrafficLightShape = BaseShape<'traffic_light', TrafficLightProps>
type TrafficSignShape = BaseShape<'traffic_sign', TrafficSignProps>
type CrosswalkShape = BaseShape<'crosswalk', CrosswalkProps>
type PolygonShape = BaseShape<'polygon', PolygonProps>

interface BundleGeometry {
  /**
   * Fitted plan-view primitives for the reference line (the bundle's leftmost
   * boundary), contiguous stations starting at s = 0, OpenDRIVE meters.
   */
  planView: OdrGeometry[]
  /** Station + pose on the fitted reference line at every width station. */
  samplePoses: FittedSamplePose[]
  /**
   * Full lane width (m) per lane (bundle order, left→right) at each
   * reference-line station (index-aligned with `samplePoses`).
   */
  laneWidths: number[][]
  /** Total fitted reference-line arc length (m). */
  length: number
  /**
   * Reference-line height samples (m) at the fitted stations of the reference
   * boundary's own vertices. Empty when the drawn points carry no height, in
   * which case the road emits `<elevationProfile/>` as before.
   */
  elevationSamples: ElevationSample[]
}

/** A road bundle: laterally adjacent lanes emitted as one <road>. */
interface ExportBundle {
  /** Lanes ordered left→right in travel direction; index i ⇒ ODR lane -(i+1). */
  lanes: LaneShape[]
  geom: BundleGeometry
}

/** O(1) shape lookup by id. */
function buildShapeMap(shapes: readonly BaseShape[]): Map<string, BaseShape> {
  const map = new Map<string, BaseShape>()
  for (const s of shapes) map.set(s.id, s)
  return map
}

function collectPoints(
  shapeMap: Map<string, BaseShape>,
  pointIds: string[],
  invert: boolean,
  pointOverrides: Map<string, Point2D>
): BoundaryPoint[] {
  const ids = invert ? [...pointIds].reverse() : pointIds
  const pts: BoundaryPoint[] = []
  for (const id of ids) {
    // A point override replaces the planar position only; the height rides on
    // the stored point shape (overrides come from planar snapping).
    const p = shapeMap.get(id) as unknown as PointShape | undefined
    const z = p?.props?.z
    const ov = pointOverrides.get(id)
    if (ov) {
      pts.push(z === undefined ? { x: ov.x, y: ov.y } : { x: ov.x, y: ov.y, z })
      continue
    }
    if (p) pts.push(z === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, z })
  }
  return pts
}

/**
 * A boundary vertex in canvas pixels, carrying the optional world height (m)
 * stored on the point shape. `z` is in meters even though `x` / `y` are
 * pixels: it is never subject to the pixel/meter scale because no planar
 * transform touches it.
 */
interface BoundaryPoint extends Point2D {
  z?: number
}

/** Boundary polyline of a linestring in travel order, or null when unusable. */
function boundaryPointsOf(
  shapeMap: Map<string, BaseShape>,
  boundaryId: string | null,
  invert: boolean,
  pointOverrides: Map<string, Point2D>
): BoundaryPoint[] | null {
  if (!boundaryId) return null
  const ls = shapeMap.get(boundaryId) as unknown as LinestringShape | undefined
  if (!ls) return null
  const pts = collectPoints(shapeMap, ls.props.pointIds, invert, pointOverrides)
  return pts.length >= 2 ? pts : null
}

/**
 * Group lanes into road bundles by lateral adjacency.
 *
 * Lane B is the direct right neighbour of lane A when A's right boundary IS
 * B's left boundary — the same linestring traversed in the same direction
 * (`A.invertRight === B.invertLeft`); a direction mismatch means the
 * neighbour travels the other way (e.g. the two sides of a two-way road) and
 * belongs in its own bundle. The relation must be unique on both sides so
 * pathological data (several lanes claiming one boundary side) degrades to
 * separate bundles instead of guessing.
 *
 * Because adjacency requires sharing the whole linestring, every lane of a
 * bundle spans the same longitudinal extent by construction.
 */
function detectBundles(lanes: LaneShape[]): LaneShape[][] {
  const byLeft = new Map<string, LaneShape[]>()
  const byRight = new Map<string, LaneShape[]>()
  for (const lane of lanes) {
    const l = lane.props.leftBoundaryId
    const r = lane.props.rightBoundaryId
    if (l) byLeft.set(l, [...(byLeft.get(l) ?? []), lane])
    if (r) byRight.set(r, [...(byRight.get(r) ?? []), lane])
  }

  const rightNeighbor = new Map<string, LaneShape>()
  const hasLeftNeighbor = new Set<string>()
  for (const lane of lanes) {
    const rb = lane.props.rightBoundaryId
    if (!rb) continue
    const candidates = (byLeft.get(rb) ?? []).filter(
      b => b.id !== lane.id && b.props.invertLeft === lane.props.invertRight
    )
    if (candidates.length !== 1) continue
    const b = candidates[0]
    const owners = (byRight.get(rb) ?? []).filter(
      a => a.props.invertRight === b.props.invertLeft
    )
    if (owners.length !== 1 || owners[0].id !== lane.id) continue
    rightNeighbor.set(lane.id, b)
    hasLeftNeighbor.add(b.id)
  }

  const bundles: LaneShape[][] = []
  const visited = new Set<string>()
  const walk = (start: LaneShape): void => {
    const bundle: LaneShape[] = []
    let cur: LaneShape | undefined = start
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id)
      bundle.push(cur)
      cur = rightNeighbor.get(cur.id)
    }
    if (bundle.length > 0) bundles.push(bundle)
  }
  // Start from the leftmost lane of each chain ...
  for (const lane of lanes) {
    if (!visited.has(lane.id) && !hasLeftNeighbor.has(lane.id)) walk(lane)
  }
  // ... and break adjacency cycles (degenerate ring data) deterministically.
  for (const lane of lanes) {
    if (!visited.has(lane.id)) walk(lane)
  }
  return bundles
}

/** Distance from `p` to the polyline `pts` (projection onto each segment). */
function distancePointToPolyline(p: Point2D, pts: readonly Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    if (t < 0) t = 0
    if (t > 1) t = 1
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < best) best = d
  }
  return best
}

/**
 * Signed lateral offset (m, positive toward -t / the right of the travel
 * direction) from each fitted reference pose to a boundary polyline, measured
 * along the pose normal — the exact inverse of the importer's
 * offset-along-normal boundary reconstruction. Among multiple normal/boundary
 * intersections the one closest to the previous station's offset wins
 * (continuity); stations whose normal misses the boundary entirely (e.g. the
 * very ends, where boundary extents differ slightly) fall back to the
 * closest-point distance.
 */
/**
 * Largest believable offset change between neighbouring width stations (m).
 * An intersection jumping further than this is the normal ray hitting a far
 * branch of the boundary (e.g. the opposite end of a ~180° ramp), not the
 * adjacent lane edge, and is discarded for the closest-point fallback.
 */
const OFFSET_JUMP_TOL_M = 5

function normalOffsets(poses: readonly FittedSamplePose[], bnd: readonly Point2D[]): number[] {
  const out: number[] = []
  let prev: number | null = null
  for (const pose of poses) {
    // Right normal of heading h in ENU: (sin h, -cos h).
    const nx = Math.sin(pose.hdg)
    const ny = -Math.cos(pose.hdg)
    const fallback = distancePointToPolyline({ x: pose.x, y: pose.y }, bnd)
    const refVal = prev ?? fallback
    let best: number | null = null
    for (let i = 0; i < bnd.length - 1; i++) {
      const dx = bnd[i + 1].x - bnd[i].x
      const dy = bnd[i + 1].y - bnd[i].y
      // Solve pose + t·n = bnd[i] + w·(bnd[i+1]-bnd[i]) for (t, w).
      const det = dx * ny - dy * nx
      if (Math.abs(det) < 1e-12) continue
      const rx = bnd[i].x - pose.x
      const ry = bnd[i].y - pose.y
      const w = (nx * ry - ny * rx) / det
      if (w < -1e-9 || w > 1 + 1e-9) continue
      const t = (dx * ry - dy * rx) / det
      if (best === null || Math.abs(t - refVal) < Math.abs(best - refVal)) best = t
    }
    if (best === null || Math.abs(best - refVal) > OFFSET_JUMP_TOL_M) best = fallback
    prev = best
    out.push(best)
  }
  return out
}

/**
 * Build the bundle geometry: the fitted reference line (leftmost boundary)
 * plus per-lane width samples.
 *
 * The reference polyline keeps the boundary's own vertices and is refined
 * with uniform arc-length stations so the width grid is at least as dense as
 * the densest boundary of the bundle. The polyline is then fitted into
 * analytic plan-view primitives (line / arc / paramPoly3), and the width of
 * lane i at station j is the gap between its inner and outer boundary
 * measured along the fitted reference normal at that station, so the
 * importer's offset-along-normal reconstruction reproduces the original
 * boundaries with no longitudinal skew.
 */
function buildBundleGeometry(
  shapeMap: Map<string, BaseShape>,
  bundleLanes: LaneShape[],
  pointOverrides: Map<string, Point2D>
): BundleGeometry | null {
  const first = bundleLanes[0]
  const boundaries: BoundaryPoint[][] = []
  const left = boundaryPointsOf(shapeMap, first.props.leftBoundaryId, first.props.invertLeft, pointOverrides)
  if (!left) return null
  boundaries.push(left)
  for (const lane of bundleLanes) {
    const right = boundaryPointsOf(shapeMap, lane.props.rightBoundaryId, lane.props.invertRight, pointOverrides)
    if (!right) return null
    boundaries.push(right)
  }

  // Boundaries in OpenDRIVE meters (ENU).
  const bndOdr = boundaries.map(b => b.map(p => ({ x: pxToEnuX(p.x), y: pxToEnuY(p.y) })))

  // The plan view is fitted to the reference boundary's own vertices only:
  // they are true samples of the drawn curve, so the fitter's tangent
  // estimates are sound there. Densifying the polyline before the fit would
  // insert points along its chords, whose collinear runs masquerade as
  // straight stretches and corrupt the tangent estimates (worst at the road
  // ends, where the start/end heading defines the contact cross-section
  // shared with the neighbouring roads).
  const ref = bndOdr[0]
  const fit = fitPlanView(ref)
  if (fit.geometries.length === 0 || !(fit.length > 0)) return null

  // Width stations: the reference vertices (corners must survive into the
  // width records) merged with a uniform grid as dense as the densest
  // boundary (inner-boundary detail must survive too). Grid stations are
  // placed by chord-length interpolation between the fitted stations of the
  // surrounding reference vertices and posed on the fitted curve.
  let n = 2
  for (const b of bndOdr) n = Math.max(n, b.length)
  const cum: number[] = [0]
  for (let i = 1; i < ref.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(ref[i].x - ref[i - 1].x, ref[i].y - ref[i - 1].y))
  }
  const total = cum[cum.length - 1]
  if (!(total > 0)) return null
  const params = cum.map(c => c / total)
  for (let j = 0; j < n; j++) params.push(j / (n - 1))
  params.sort((a, b) => a - b)
  const stationOf = (t: number): number => {
    const target = t * total
    let i = 1
    while (i < cum.length - 1 && cum[i] < target) i++
    const c0 = cum[i - 1]
    const c1 = cum[i]
    const s0 = fit.samplePoses[i - 1].s
    const s1 = fit.samplePoses[i].s
    const f = c1 > c0 ? (target - c0) / (c1 - c0) : 0
    return s0 + (s1 - s0) * f
  }
  const poseAtStation = (s: number): FittedSamplePose => {
    const clamped = Math.min(Math.max(s, 0), fit.length)
    let g = fit.geometries[0]
    for (const geom of fit.geometries) {
      if (geom.s <= clamped + 1e-12) g = geom
      else break
    }
    const p = evalGeometry(g, Math.min(Math.max(clamped - g.s, 0), g.length))
    return { s: clamped, x: p.x, y: p.y, hdg: p.hdg }
  }
  const samplePoses: FittedSamplePose[] = []
  for (const t of params) {
    const pose = poseAtStation(stationOf(t))
    const last = samplePoses[samplePoses.length - 1]
    if (!last || pose.s > last.s + 1e-9 || samplePoses.length === 0) samplePoses.push(pose)
  }
  if (samplePoses.length < 2) return null

  const offsets = bndOdr.map(b => normalOffsets(samplePoses, b))
  // Contact stations measure each boundary's own endpoint (projected onto
  // the contact normal) instead of the ray/polyline crossing: the endpoints
  // are the welded corners shared with the neighbouring road, so both sides
  // of a contact derive their border positions from the same drawn points
  // and meet without a lateral step. (The ray crossing drifts by up to a few
  // centimeters when a boundary meets the contact at a skew.)
  const projectEndpoint = (pose: FittedSamplePose, p: Point2D, fallback: number): number => {
    const t = (p.x - pose.x) * Math.sin(pose.hdg) - (p.y - pose.y) * Math.cos(pose.hdg)
    return Math.abs(t - fallback) <= 0.5 ? t : fallback
  }
  const lastIdx = samplePoses.length - 1
  for (let b = 0; b < bndOdr.length; b++) {
    const bnd = bndOdr[b]
    offsets[b][0] = projectEndpoint(samplePoses[0], bnd[0], offsets[b][0])
    offsets[b][lastIdx] = projectEndpoint(samplePoses[lastIdx], bnd[bnd.length - 1], offsets[b][lastIdx])
  }
  const laneWidths = bundleLanes.map((_, i) =>
    samplePoses.map((_, j) => Math.max(0, offsets[i + 1][j] - offsets[i][j]))
  )

  // Elevation samples: the reference boundary's own vertices already have a
  // fitted station (fit.samplePoses is index-aligned with `ref`), so the
  // height rides along without resampling. Boundaries other than the
  // reference share the station's height (no superelevation support yet), so
  // taking the reference boundary alone is exact for imported roads.
  const elevationSamples: ElevationSample[] = []
  for (let i = 0; i < ref.length && i < fit.samplePoses.length; i++) {
    const z = boundaries[0][i]?.z
    if (z === undefined) continue
    elevationSamples.push({ s: fit.samplePoses[i].s, z })
  }

  return {
    planView: fit.geometries,
    samplePoses,
    laneWidths,
    length: fit.length,
    // All-or-nothing: a partially annotated boundary would fabricate a datum
    // of 0 for the un-annotated stretch and invent a cliff.
    elevationSamples: elevationSamples.length === ref.length ? elevationSamples : [],
  }
}

/**
 * Snap together boundary endpoints of connected lanes by clustering nearby
 * points and using the centroid as the canonical position.
 *
 * Two lanes that "look" connected on the canvas may actually own separate
 * point shapes whose coordinates drift by a few pixels. The road exporter
 * would then emit a small visible gap between them in the player. This
 * routine collects the boundary endpoints of lanes that participate in a
 * next/prev relationship and snaps clusters within epsilonPx onto a single
 * representative position.
 */
function buildBoundaryAlignmentOverrides(
  shapeMap: Map<string, BaseShape>,
  lanes: LaneShape[],
  epsilonPx: number = 30
): Map<string, Point2D> {
  type Endpoint = {
    pointId: string
    laneId: string
    side: 'start' | 'end'
    boundary: 'left' | 'right'
    x: number
    y: number
  }
  const endpoints: Endpoint[] = []
  const laneIds = new Set(lanes.map((l) => l.id))

  const collectEndpoints = (lane: LaneShape, side: 'start' | 'end') => {
    for (const sideKey of ['leftBoundaryId', 'rightBoundaryId'] as const) {
      const lsId = lane.props[sideKey]
      if (!lsId) continue
      const ls = shapeMap.get(lsId) as unknown as LinestringShape | undefined
      if (!ls) continue
      const invert =
        sideKey === 'leftBoundaryId' ? lane.props.invertLeft : lane.props.invertRight
      const ids = invert ? [...ls.props.pointIds].reverse() : ls.props.pointIds
      if (ids.length === 0) continue
      const pid = side === 'start' ? ids[0] : ids[ids.length - 1]
      const pt = shapeMap.get(pid) as unknown as PointShape | undefined
      if (!pt) continue
      endpoints.push({
        pointId: pid,
        laneId: lane.id,
        side,
        boundary: sideKey === 'leftBoundaryId' ? 'left' : 'right',
        x: pt.x,
        y: pt.y,
      })
    }
  }

  // Restrict to lanes that participate in a next/prev relationship.
  for (const lane of lanes) {
    const hasNext = (lane.props.next || []).some((id) => laneIds.has(id))
    const hasPrev = (lane.props.prev || []).some((id) => laneIds.has(id))
    if (hasNext) collectEndpoints(lane, 'end')
    if (hasPrev) collectEndpoints(lane, 'start')
  }

  // Forbidden point pairs: a lane's start-side and end-side endpoint Points
  // must never land in the same cluster. A connecting lane shorter than
  // epsilon would otherwise get its start and end merged into one cluster,
  // collapsing its boundaries below the degenerate-road export guard and
  // silently dropping the lane (and its next/prev chain). The constraint is
  // tracked by point id — not by the owning lane entry — because boundary
  // endpoints are often Point shapes shared with the neighbouring lanes, and
  // a neighbour's entry could otherwise pull both of a short lane's end
  // points into one cluster.
  const sidePids = new Map<string, { start: Set<string>; end: Set<string> }>()
  for (const ep of endpoints) {
    const entry = sidePids.get(ep.laneId) ?? { start: new Set(), end: new Set() }
    entry[ep.side].add(ep.pointId)
    sidePids.set(ep.laneId, entry)
  }
  const forbidden = new Map<string, Set<string>>()
  const forbid = (a: string, b: string): void => {
    forbidden.set(a, (forbidden.get(a) ?? new Set()).add(b))
    forbidden.set(b, (forbidden.get(b) ?? new Set()).add(a))
  }
  for (const { start, end } of sidePids.values()) {
    for (const s of start) {
      for (const e of end) {
        if (s !== e) forbid(s, e)
      }
    }
  }
  // A lane's left-boundary endpoint must never merge with its right-boundary
  // endpoint on the same side: lanes narrower than epsilon would be pinched
  // to zero width at the contact (and the welded neighbours dragged along).
  // Tracked by point id like above, so a genuine zero-width taper — where
  // left and right already share one Point — is unaffected.
  const boundaryPids = new Map<string, { left: Set<string>; right: Set<string> }>()
  for (const ep of endpoints) {
    const key = `${ep.laneId}|${ep.side}`
    const entry = boundaryPids.get(key) ?? { left: new Set(), right: new Set() }
    entry[ep.boundary].add(ep.pointId)
    boundaryPids.set(key, entry)
  }
  for (const { left, right } of boundaryPids.values()) {
    for (const l of left) {
      for (const r of right) {
        if (l !== r) forbid(l, r)
      }
    }
  }

  // Greedy clustering: group points within epsilon of each other, with three
  // refinements over plain first-fit grouping:
  // 1. An endpoint never joins a cluster holding a point its point id is
  //    forbidden against (see above).
  // 2. Among the eligible clusters the nearest one wins, so the far end of a
  //    short lane clusters with its true counterpart rather than with the
  //    first cluster found within epsilon.
  // 3. An endpoint whose nearest in-range cluster is a forbidden one never
  //    hops to a farther eligible cluster: the forbidden cluster marks a
  //    neighbouring corner of the same contact (narrow lane / short lane),
  //    so anything beyond it belongs to a different corner entirely and
  //    merging would drag the contact sideways. It opens its own cluster.
  const clusters: Endpoint[][] = []
  const eps2 = epsilonPx * epsilonPx
  for (const ep of endpoints) {
    let best: Endpoint[] | null = null
    let bestD2 = Infinity
    let blockedD2 = Infinity
    const epForbidden = forbidden.get(ep.pointId)
    for (const cluster of clusters) {
      const c0 = cluster[0]
      const dx = ep.x - c0.x
      const dy = ep.y - c0.y
      const d2 = dx * dx + dy * dy
      if (d2 > eps2) continue
      if (epForbidden && cluster.some((m) => epForbidden.has(m.pointId))) {
        if (d2 < blockedD2) blockedD2 = d2
        continue
      }
      if (d2 >= bestD2) continue
      best = cluster
      bestD2 = d2
    }
    if (best && bestD2 <= blockedD2) best.push(ep)
    else clusters.push([ep])
  }

  // Use each cluster centroid as the snapped position.
  const overrides = new Map<string, Point2D>()
  for (const cluster of clusters) {
    if (cluster.length < 2) continue // Solitary points need no snapping.
    let sx = 0
    let sy = 0
    for (const ep of cluster) {
      sx += ep.x
      sy += ep.y
    }
    const cx = sx / cluster.length
    const cy = sy / cluster.length
    for (const ep of cluster) {
      // Last write wins if the same point id is referenced multiple times.
      overrides.set(ep.pointId, { x: cx, y: cy })
    }
  }
  return overrides
}

function emitPlanView(geom: BundleGeometry): string {
  const lines: string[] = []
  lines.push(`    <planView>`)
  for (const g of geom.planView) {
    if (g.length < 1e-9) continue
    lines.push(
      `      <geometry s="${fmt(g.s)}" x="${fmt(g.x)}" y="${fmt(g.y)}" hdg="${fmt(g.hdg)}" length="${fmt(g.length)}">`
    )
    if (g.kind === 'arc') {
      lines.push(`        <arc curvature="${fmtPrecise(g.curvature)}"/>`)
    } else if (g.kind === 'paramPoly3') {
      lines.push(
        `        <paramPoly3 aU="${fmtPrecise(g.aU)}" bU="${fmtPrecise(g.bU)}" cU="${fmtPrecise(g.cU)}" dU="${fmtPrecise(g.dU)}" ` +
          `aV="${fmtPrecise(g.aV)}" bV="${fmtPrecise(g.bV)}" cV="${fmtPrecise(g.cV)}" dV="${fmtPrecise(g.dV)}" pRange="arcLength"/>`
      )
    } else {
      lines.push(`        <line/>`)
    }
    lines.push(`      </geometry>`)
  }
  lines.push(`    </planView>`)
  return lines.join('\n')
}

/**
 * Emit `<elevationProfile>` from the road's per-point heights.
 *
 * Roads whose points carry no height (all drawn content, and imported roads
 * from flat maps) keep emitting the empty `<elevationProfile/>` — the
 * long-standing "no elevation" convention that consumers already handle.
 */
function emitElevationProfile(geom: BundleGeometry): string {
  const records = fitElevationProfile(geom.elevationSamples)
  if (records.length === 0) return `    <elevationProfile/>`
  const lines: string[] = [`    <elevationProfile>`]
  for (const r of records) {
    lines.push(
      `      <elevation s="${fmt(r.s)}" a="${fmtPrecise(r.a)}" b="${fmtPrecise(r.b)}" ` +
        `c="${fmtPrecise(r.c)}" d="${fmtPrecise(r.d)}"/>`
    )
  }
  lines.push(`    </elevationProfile>`)
  return lines.join('\n')
}

/**
 * Map a lanelet-style lane subtype to an OpenDRIVE lane type. The exact
 * OpenDRIVE type wins when the lane carries `odr_type` (set by the OpenDRIVE
 * importer), so imported maps round-trip their lane types.
 */
const LANELET_SUBTYPE_TO_ODR_TYPE: Record<string, string> = {
  road: 'driving',
  highway: 'driving',
  play_street: 'driving',
  emergency_lane: 'shoulder',
  bus_lane: 'bus',
  bicycle_lane: 'biking',
  walkway: 'sidewalk',
  shared_walkway: 'sidewalk',
  stairs: 'sidewalk',
  crosswalk: 'walking',
  exit: 'exit',
}

function odrLaneTypeFor(lane: LaneShape): string {
  const attrs = lane.props.attributes ?? {}
  if (attrs.odr_type) return attrs.odr_type
  return LANELET_SUBTYPE_TO_ODR_TYPE[attrs.subtype ?? ''] ?? 'driving'
}

/** Road mark type for a boundary linestring (dashed subtype -> broken). */
function roadMarkTypeFor(shapeMap: Map<string, BaseShape>, boundaryId: string | null): string {
  if (!boundaryId) return 'solid'
  const ls = shapeMap.get(boundaryId) as unknown as LinestringShape | undefined
  // OpenDRIVE round-trip: prefer the carry-through value captured at import.
  const carried = ls?.props?.attributes?.odr_road_mark_type
  if (carried) return carried
  return ls?.props?.attributes?.subtype === 'dashed' ? 'broken' : 'solid'
}

/**
 * Emit a `<roadMark>` element for a boundary linestring. Honors carry-through
 * attributes (`odr_road_mark_*`) so an imported road that has been edited
 * (and therefore cannot be re-emitted verbatim) still retains its original
 * color / weight / width information.
 */
function roadMarkElementFor(
  shapeMap: Map<string, BaseShape>,
  boundaryId: string | null
): string {
  const ls = boundaryId ? (shapeMap.get(boundaryId) as unknown as LinestringShape | undefined) : undefined
  const attrs: Record<string, string | undefined> = ls?.props?.attributes ?? {}
  const type = roadMarkTypeFor(shapeMap, boundaryId)
  const color = attrs.odr_road_mark_color ?? 'white'
  const weight = attrs.odr_road_mark_weight ?? 'standard'
  const width = attrs.odr_road_mark_width ?? '0.13'
  const parts = [
    'sOffset="0"',
    `type="${type}"`,
    `weight="${weight}"`,
    `color="${color}"`,
    `width="${width}"`,
  ]
  if (attrs.odr_road_mark_material !== undefined) parts.push(`material="${attrs.odr_road_mark_material}"`)
  if (attrs.odr_road_mark_lane_change !== undefined) parts.push(`laneChange="${attrs.odr_road_mark_lane_change}"`)
  return `<roadMark ${parts.join(' ')}/>`
}

function emitLanes(
  bundle: ExportBundle,
  plan: ConnectivityPlan,
  shapeMap: Map<string, BaseShape>
): string {
  const geom = bundle.geom
  const lines: string[] = []
  lines.push(`    <lanes>`)
  // The plan view follows the bundle's leftmost boundary, so lane 0 (center)
  // lies on the left edge of lane -1 and no laneOffset is required. Lanes are
  // emitted -1, -2, ... from the reference line outward (left→right in travel
  // direction), each spanning its full drawn width.
  lines.push(`      <laneSection s="0">`)
  lines.push(`        <center>`)
  lines.push(`          <lane id="0" type="none" level="false">`)
  lines.push(`            <link/>`)
  lines.push(`            ${roadMarkElementFor(shapeMap, bundle.lanes[0].props.leftBoundaryId)}`)
  lines.push(`          </lane>`)
  lines.push(`        </center>`)
  lines.push(`        <right>`)
  bundle.lanes.forEach((lane, i) => {
    const odrId = -(i + 1)
    lines.push(`          <lane id="${odrId}" type="${odrLaneTypeFor(lane)}" level="false">`)
    emitLaneLink(lines, plan.lanePredecessor.get(lane.id), plan.laneSuccessor.get(lane.id))
    emitWidthEntries(geom, i, lines)
    lines.push(`            ${roadMarkElementFor(shapeMap, lane.props.rightBoundaryId)}`)
    lines.push(`          </lane>`)
  })
  lines.push(`        </right>`)
  lines.push(`      </laneSection>`)
  lines.push(`    </lanes>`)
  return lines.join('\n')
}

function emitLaneLink(out: string[], predId: number | undefined, succId: number | undefined): void {
  if (predId === undefined && succId === undefined) {
    out.push(`            <link/>`)
    return
  }
  out.push(`            <link>`)
  if (predId !== undefined) {
    out.push(`              <predecessor id="${predId}"/>`)
  }
  if (succId !== undefined) {
    out.push(`              <successor id="${succId}"/>`)
  }
  out.push(`            </link>`)
}

/**
 * Maximum width error (m) tolerated when folding stations into one record.
 * Width samples carry chordal noise of the same order (the boundary polyline
 * is a chordal approximation of the original curve), so a 1 cm band mostly
 * absorbs that noise while staying far below the 5 cm position tolerance.
 */
const WIDTH_SIMPLIFY_TOL_M = 0.01

/**
 * Piecewise-linear full lane width records: a + b*ds (c=d=0). Station runs
 * are simplified greedily: a record absorbs every following station whose
 * widths stay within WIDTH_SIMPLIFY_TOL_M of the straight ramp between the
 * record start and the run end, so constant-width lanes collapse to a single
 * record and smoothly varying lanes to a few.
 */
function emitWidthEntries(geom: BundleGeometry, laneIndex: number, out: string[]): void {
  const allWidths = geom.laneWidths[laneIndex]
  const poses = geom.samplePoses
  // Strictly increasing stations (duplicates share one width sample).
  const sArr: number[] = []
  const wArr: number[] = []
  for (let i = 0; i < poses.length; i++) {
    if (sArr.length === 0 || poses[i].s > sArr[sArr.length - 1] + 1e-9) {
      sArr.push(poses[i].s)
      wArr.push(allWidths[i])
    }
  }
  const recs: { s: number; a: number; b: number }[] = []
  if (sArr.length < 2) {
    recs.push({ s: 0, a: wArr[0] ?? 0, b: 0 })
  }
  let i0 = 0
  while (i0 < sArr.length - 1) {
    let end = i0 + 1
    for (let j = i0 + 2; j < sArr.length; j++) {
      const slope = (wArr[j] - wArr[i0]) / (sArr[j] - sArr[i0])
      let ok = true
      for (let k = i0 + 1; k < j; k++) {
        if (Math.abs(wArr[i0] + slope * (sArr[k] - sArr[i0]) - wArr[k]) > WIDTH_SIMPLIFY_TOL_M) {
          ok = false
          break
        }
      }
      if (!ok) break
      end = j
    }
    recs.push({ s: sArr[i0], a: wArr[i0], b: (wArr[end] - wArr[i0]) / (sArr[end] - sArr[i0]) })
    i0 = end
  }
  for (const r of recs) {
    out.push(`            <width sOffset="${fmt(r.s)}" a="${fmt(r.a)}" b="${fmtPrecise(r.b)}" c="0" d="0"/>`)
  }
}

type RoadLinkTarget = { kind: 'road' | 'junction'; id: number }

/** Length (m) of a synthesized junction connecting road. Kept below the
 * importer's micro-section threshold so re-imports skip it and bridge the
 * lane links across instead of materializing an extra sliver lane. Also kept
 * below the 1 cm contact-point gap tolerance of ASAM quality checkers: the
 * incoming lane end and the outgoing lane start coincide in the drawing, so
 * the stub necessarily overlaps the outgoing road and its whole length shows
 * up as a contact-point discontinuity to gap checks. */
const CONNECTING_ROAD_LENGTH_M = 0.005

/**
 * Contact widths below this (m) count as zero for lane linking: OpenDRIVE
 * forbids predecessor/successor records on lanes that have zero width at the
 * linked contact (zero-width / appearing-lane semantics). Welded taper lanes
 * produce exact zeros; the epsilon also covers values that round to zero in
 * the 6-decimal output.
 */
const ZERO_WIDTH_LINK_EPS_M = 1e-3

/** Wrap an angle to (-pi, pi]. */
function wrapAngleRad(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * A zero-length(ish) connecting road synthesized for one branch / merge lane
 * edge, giving junctions the standard incoming -> connecting -> outgoing
 * structure (the mainline roads keep junction="-1").
 */
interface ConnectingRoadSpec {
  roadId: number
  junctionId: number
  incomingRoadId: number
  outgoingRoadId: number
  /** ODR lane id of the source lane on the incoming road. */
  fromOdrLaneId: number
  /** ODR lane id of the target lane on the outgoing road. */
  toOdrLaneId: number
  /** Geometry seed at the source lane's end (see ConnectingSource). */
  source: ConnectingSource
  /** Heading / width of the target lane at its start (see ConnectingTarget). */
  target: ConnectingTarget | null
}

/**
 * Pose / width / type of the lane a connecting road starts from: the inner
 * boundary endpoint of the source lane (ENU meters), the travel heading
 * there, the lane's end width, and its OpenDRIVE lane type.
 */
interface ConnectingSource {
  x: number
  y: number
  hdg: number
  width: number
  laneType: string
}

/**
 * Pose / width of the lane a connecting road ends on, at its start contact:
 * the lane's inner-border point as the outgoing road actually emits it
 * (reference pose + accumulated widths), its travel heading and width there.
 * The stub blends onto them (Hermite onto the exact border point when it is
 * ahead of the source, else an arc sweep, plus a linear width ramp) so both
 * of its contacts stay gap-free even when the drawing kinks or staggers at
 * the branch point.
 */
interface ConnectingTarget {
  x: number
  y: number
  hdg: number
  width: number
}

interface ConnectivityPlan {
  /** Road-level predecessor / successor per road id. */
  roadPredecessor: Map<number, RoadLinkTarget>
  roadSuccessor: Map<number, RoadLinkTarget>
  /** ODR lane id of the linked lane, per lane shape id (road-linked roads only). */
  lanePredecessor: Map<string, number>
  laneSuccessor: Map<string, number>
  junctions: {
    id: number
    connections: { incoming: number; connecting: number; laneLinks: { from: number; to: number }[] }[]
    /** <priority high low> records between connecting roads (right of way). */
    priorities: { high: number; low: number }[]
  }[]
  /** Synthesized connecting roads, one per junction-routed lane edge. */
  connectingRoads: ConnectingRoadSpec[]
  /**
   * yieldLaneIds pairs ("rowLaneShapeId|yieldLaneShapeId") expressed as
   * junction <priority> records; excluded from the userData fallback stash.
   */
  handledYieldPairs: Set<string>
  /**
   * Lane edges whose contact width is (near) zero on either side. OpenDRIVE
   * forbids linking lanes that have zero width at the linked contact (the
   * "appearing lane" rules), so these edges are kept out of every standard
   * <link> / <laneLink> record and stashed as
   * <userData code="hiddenLaneLinks"> on the road of `home` instead, from
   * where the importer restores the next/prev relationship.
   */
  hiddenLaneEdges: { from: string; to: string; home: string }[]
}

/**
 * Plan road links, lane links and synthesized <junction> elements.
 *
 * A road <link> can name only one predecessor and one successor, so a road
 * pair (P → Q) is representable as a plain road link only when Q is P's only
 * successor road AND P is Q's only predecessor road AND every lane edge
 * between them is 1:1 (its source's only `next` and its target's only
 * `prev`). Every other lane edge is routed through a synthesized junction
 * with the standard structure: a short connecting road (junction-stamped,
 * with a guaranteed road-level predecessor=incoming / successor=outgoing
 * link) is synthesized at the contact point for each lane edge, and the
 * junction's <connection incomingRoad connectingRoad contactPoint="start">
 * carries the per-lane <laneLink>. The mainline roads stay junction="-1" and
 * link to the junction by id. Edges that share a road collapse into the same
 * junction (connected components), so a 2-in x 2-out diamond becomes one
 * junction with four connections.
 *
 * Right-of-way lane pairs (`yieldLaneIds`) whose two lanes both feed
 * connecting roads of the same junction are emitted as standard
 * <priority high low> records between those connecting roads.
 */
function planConnectivity(
  exportBundles: ExportBundle[],
  roadIdOf: Map<string, number>,
  odrIdOf: Map<string, number>,
  firstJunctionId: number,
  connectingSourceFor: (laneShapeId: string) => ConnectingSource | null,
  connectingTargetFor: (laneShapeId: string) => ConnectingTarget | null,
  contactWidth: (laneShapeId: string, contact: 'start' | 'end') => number | null,
  externalLanes: Map<string, LaneShape> = new Map()
): ConnectivityPlan {
  const validNext = new Map<string, string[]>()
  const validPrev = new Map<string, string[]>()
  for (const bundle of exportBundles) {
    for (const lane of bundle.lanes) {
      validNext.set(lane.id, (lane.props.next ?? []).filter(id => roadIdOf.has(id)))
      validPrev.set(lane.id, (lane.props.prev ?? []).filter(id => roadIdOf.has(id)))
    }
  }
  // Carry-through: lanes of verbatim (unedited) roads participate as link
  // endpoints — their roads are never re-emitted here, but regenerated roads
  // must still link to / from them. Edges between two external lanes are
  // covered by the verbatim XML and are skipped below.
  for (const [id, lane] of externalLanes) {
    validNext.set(id, (lane.props.next ?? []).filter(t => roadIdOf.has(t)))
    validPrev.set(id, (lane.props.prev ?? []).filter(t => roadIdOf.has(t)))
  }

  // Lanes with (near) zero width at a linked contact must not carry standard
  // link records there (zero-width / appearing-lane rules), so those edges
  // are diverted into the hiddenLaneLinks userData stash. The stash lives on
  // the `from` road when it is re-emitted in this export, else on the `to`
  // road (one of the two always is: external-external edges stay verbatim).
  const hiddenLaneEdges: ConnectivityPlan['hiddenLaneEdges'] = []
  for (const [laneId, nexts] of validNext) {
    if (nexts.length === 0) continue
    const kept: string[] = []
    for (const to of nexts) {
      if (externalLanes.has(laneId) && externalLanes.has(to)) {
        kept.push(to)
        continue
      }
      const wFrom = contactWidth(laneId, 'end')
      const wTo = contactWidth(to, 'start')
      if (
        (wFrom !== null && wFrom < ZERO_WIDTH_LINK_EPS_M) ||
        (wTo !== null && wTo < ZERO_WIDTH_LINK_EPS_M)
      ) {
        hiddenLaneEdges.push({ from: laneId, to, home: externalLanes.has(laneId) ? to : laneId })
        const prevs = validPrev.get(to)
        if (prevs) validPrev.set(to, prevs.filter(p => p !== laneId))
        continue
      }
      kept.push(to)
    }
    if (kept.length !== nexts.length) validNext.set(laneId, kept)
  }

  interface LaneEdge {
    from: string
    to: string
  }
  const succRoads = new Map<number, Set<number>>()
  const predRoads = new Map<number, Set<number>>()
  const edgesByPair = new Map<string, LaneEdge[]>()
  for (const [laneId, nexts] of validNext) {
    const fromRoad = roadIdOf.get(laneId)!
    for (const to of nexts) {
      if (externalLanes.has(laneId) && externalLanes.has(to)) continue
      const toRoad = roadIdOf.get(to)!
      succRoads.set(fromRoad, (succRoads.get(fromRoad) ?? new Set()).add(toRoad))
      predRoads.set(toRoad, (predRoads.get(toRoad) ?? new Set()).add(fromRoad))
      const key = `${fromRoad}->${toRoad}`
      edgesByPair.set(key, [...(edgesByPair.get(key) ?? []), { from: laneId, to }])
    }
  }

  const plan: ConnectivityPlan = {
    roadPredecessor: new Map(),
    roadSuccessor: new Map(),
    lanePredecessor: new Map(),
    laneSuccessor: new Map(),
    junctions: [],
    connectingRoads: [],
    handledYieldPairs: new Set(),
    hiddenLaneEdges,
  }

  const junctionPairs: { incoming: number; outgoing: number; laneEdges: LaneEdge[] }[] = []
  for (const [key, laneEdges] of edgesByPair) {
    const [fromRoad, toRoad] = key.split('->').map(Number)
    const uniquePair = succRoads.get(fromRoad)!.size === 1 && predRoads.get(toRoad)!.size === 1
    const lanesOneToOne = laneEdges.every(
      e => (validNext.get(e.from) ?? []).length === 1 && (validPrev.get(e.to) ?? []).length === 1
    )
    if (uniquePair && lanesOneToOne) {
      plan.roadSuccessor.set(fromRoad, { kind: 'road', id: toRoad })
      plan.roadPredecessor.set(toRoad, { kind: 'road', id: fromRoad })
      for (const e of laneEdges) {
        plan.laneSuccessor.set(e.from, odrIdOf.get(e.to)!)
        plan.lanePredecessor.set(e.to, odrIdOf.get(e.from)!)
      }
    } else {
      junctionPairs.push({ incoming: fromRoad, outgoing: toRoad, laneEdges })
    }
  }

  // Union-find over road ids: junction-routed pairs sharing a road merge into
  // one junction.
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (true) {
      const p = parent.get(root)
      if (p === undefined || p === root) break
      root = p
    }
    let cur = x
    while (cur !== root) {
      const p = parent.get(cur)!
      parent.set(cur, root)
      cur = p
    }
    return root
  }
  const union = (a: number, b: number): void => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  for (const pair of junctionPairs) union(pair.incoming, pair.outgoing)

  // Pass 1: one junction per connected component (ids first, so junction ids
  // and connecting road ids stay sequential and collision-free).
  const junctionByRoot = new Map<number, ConnectivityPlan['junctions'][number]>()
  let nextId = firstJunctionId
  for (const pair of junctionPairs) {
    const root = find(pair.incoming)
    if (!junctionByRoot.has(root)) {
      const junction = { id: nextId++, connections: [], priorities: [] }
      junctionByRoot.set(root, junction)
      plan.junctions.push(junction)
    }
  }

  // Pass 2: synthesize one short connecting road per junction-routed lane
  // edge and register it as a <connection> of its junction.
  const connectingByLane = new Map<string, ConnectingRoadSpec[]>()
  for (const pair of junctionPairs) {
    const junction = junctionByRoot.get(find(pair.incoming))!
    for (const e of pair.laneEdges.slice().sort((a, b) => odrIdOf.get(b.from)! - odrIdOf.get(a.from)! || odrIdOf.get(b.to)! - odrIdOf.get(a.to)!)) {
      const source = connectingSourceFor(e.from)
      if (!source) continue
      const spec: ConnectingRoadSpec = {
        roadId: nextId++,
        junctionId: junction.id,
        incomingRoadId: pair.incoming,
        outgoingRoadId: pair.outgoing,
        fromOdrLaneId: odrIdOf.get(e.from)!,
        toOdrLaneId: odrIdOf.get(e.to)!,
        source,
        target: connectingTargetFor(e.to),
      }
      plan.connectingRoads.push(spec)
      junction.connections.push({
        incoming: pair.incoming,
        connecting: spec.roadId,
        laneLinks: [{ from: spec.fromOdrLaneId, to: -1 }],
      })
      const list = connectingByLane.get(e.from) ?? []
      list.push(spec)
      connectingByLane.set(e.from, list)
    }
    plan.roadSuccessor.set(pair.incoming, { kind: 'junction', id: junction.id })
    plan.roadPredecessor.set(pair.outgoing, { kind: 'junction', id: junction.id })
  }

  // Right-of-way: a lane pair (X has priority, Y yields) whose maneuvers both
  // run through connecting roads of one junction becomes <priority high low>
  // records between those connecting roads.
  const junctionById = new Map(plan.junctions.map(j => [j.id, j]))
  for (const bundle of exportBundles) {
    for (const lane of bundle.lanes) {
      const highSpecs = connectingByLane.get(lane.id)
      if (!highSpecs?.length) continue
      for (const yieldShapeId of lane.props.yieldLaneIds ?? []) {
        const lowSpecs = connectingByLane.get(yieldShapeId)
        if (!lowSpecs?.length) continue
        let expressed = false
        for (const hi of highSpecs) {
          for (const lo of lowSpecs) {
            if (hi.junctionId !== lo.junctionId) continue
            const junction = junctionById.get(hi.junctionId)!
            if (!junction.priorities.some(p => p.high === hi.roadId && p.low === lo.roadId)) {
              junction.priorities.push({ high: hi.roadId, low: lo.roadId })
            }
            expressed = true
          }
        }
        if (expressed) plan.handledYieldPairs.add(`${lane.id}|${yieldShapeId}`)
      }
    }
  }
  return plan
}

/**
 * Emit a synthesized junction connecting road: a single short segment
 * starting at the incoming lane's inner-boundary endpoint, heading along the
 * incoming road's end direction, carrying one right lane as wide as the
 * source lane. When the outgoing lane starts with a different heading or
 * width (drawn branch points may kink), the stub blends onto them — an <arc>
 * sweeping the heading difference and a linear width ramp — so the borders
 * meet both neighbours without a lateral step. The road always links
 * predecessor=incoming(road, end) and successor=outgoing(road, start), so
 * standard consumers can traverse incoming -> connecting -> outgoing without
 * dead ends.
 */
function emitConnectingRoad(spec: ConnectingRoadSpec): string {
  const { x, y, hdg, width } = spec.source
  const dHdg = spec.target ? wrapAngleRad(spec.target.hdg - hdg) : 0
  // Target border point in the source frame: when the outgoing lane's
  // emitted start sits measurably ahead of the source corner (drawn branch
  // points stagger by centimeters), a cubic Hermite interpolates both end
  // poses exactly; otherwise a minimum-length arc (or line) blends the
  // heading in place.
  let geometry = ''
  let len = CONNECTING_ROAD_LENGTH_M
  if (spec.target) {
    const cosH = Math.cos(hdg)
    const sinH = Math.sin(hdg)
    const ex = spec.target.x - x
    const ey = spec.target.y - y
    const u1 = ex * cosH + ey * sinH
    const v1 = -ex * sinH + ey * cosH
    const dist = Math.hypot(ex, ey)
    // A target at or behind the source corner (the outgoing road's emitted
    // start can sit a few millimeters behind the drawn weld) is unreachable
    // by a forward curve; an in-place blend as short as representable keeps
    // the leftover contact offset at the stagger itself.
    if (u1 < CONNECTING_ROAD_LENGTH_M) len = 0.001
    if (dist >= CONNECTING_ROAD_LENGTH_M && u1 >= 0.7 * dist && Math.abs(dHdg) <= 1.45) {
      // Hermite with parameter domain [0, L]: u(0)=0,u'(0)=1,v(0)=0,v'(0)=0,
      // u(L)=u1, u'(L)=cosθ, v(L)=v1, v'(L)=sinθ (same construction as the
      // plan-view fitter, emitted as paramPoly3 pRange="arcLength").
      let L = Math.max(dist, u1)
      let cU = 0
      let dU = 0
      let cV = 0
      let dV = 0
      const cosT = Math.cos(dHdg)
      const sinT = Math.sin(dHdg)
      const solve = (dom: number): void => {
        const A = u1 - dom
        const B = cosT - 1
        cU = (3 * A - B * dom) / (dom * dom)
        dU = (B * dom - 2 * A) / (dom * dom * dom)
        cV = (3 * v1 - sinT * dom) / (dom * dom)
        dV = (sinT * dom - 2 * v1) / (dom * dom * dom)
      }
      const arcLength = (dom: number): number => {
        const n = 32
        let acc = 0
        let px = 0
        let py = 0
        for (let k = 1; k <= n; k++) {
          const p = (dom * k) / n
          const lu = p * (1 + p * (cU + p * dU))
          const lv = p * p * (cV + p * dV)
          acc += Math.hypot(lu - px, lv - py)
          px = lu
          py = lv
        }
        return acc
      }
      for (let iter = 0; iter < 3; iter++) {
        solve(L)
        const actual = arcLength(L)
        if (!(actual > 1e-6)) break
        if (Math.abs(actual - L) < 1e-6) break
        L = actual
      }
      solve(L)
      // Stay below the importer's micro-section threshold (0.3 m) so the
      // stub keeps being bridged on re-import instead of materializing as a
      // sliver lane; larger staggers fall back to the in-place blend.
      if (L > 1e-6 && L <= 0.25) {
        len = L
        geometry = `        <paramPoly3 aU="0" bU="1" cU="${fmtPrecise(cU)}" dU="${fmtPrecise(dU)}" aV="0" bV="0" cV="${fmtPrecise(cV)}" dV="${fmtPrecise(dV)}" pRange="arcLength"/>`
      }
    }
  }
  if (!geometry) {
    geometry =
      Math.abs(dHdg) > 1e-4
        ? `        <arc curvature="${fmtPrecise(dHdg / len)}"/>`
        : `        <line/>`
  }
  const widthSlope =
    spec.target !== null && Math.abs(spec.target.width - width) > 1e-6
      ? (spec.target.width - width) / len
      : 0
  const lines: string[] = []
  lines.push(
    `  <road name="connecting" length="${fmt(len)}" id="${spec.roadId}" junction="${spec.junctionId}">`
  )
  lines.push(`    <link>`)
  lines.push(
    `      <predecessor elementType="road" elementId="${spec.incomingRoadId}" contactPoint="end"/>`
  )
  lines.push(
    `      <successor elementType="road" elementId="${spec.outgoingRoadId}" contactPoint="start"/>`
  )
  lines.push(`    </link>`)
  lines.push(`    <planView>`)
  lines.push(
    `      <geometry s="0" x="${fmt(x)}" y="${fmt(y)}" hdg="${fmt(hdg)}" length="${fmt(len)}">`
  )
  lines.push(geometry)
  lines.push(`      </geometry>`)
  lines.push(`    </planView>`)
  lines.push(`    <elevationProfile/>`)
  lines.push(`    <lateralProfile/>`)
  lines.push(`    <lanes>`)
  lines.push(`      <laneSection s="0">`)
  lines.push(`        <center>`)
  lines.push(`          <lane id="0" type="none" level="false">`)
  lines.push(`            <link/>`)
  lines.push(`            <roadMark sOffset="0" type="none" weight="standard" color="white" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </center>`)
  lines.push(`        <right>`)
  lines.push(`          <lane id="-1" type="${spec.source.laneType}" level="false">`)
  lines.push(`            <link>`)
  lines.push(`              <predecessor id="${spec.fromOdrLaneId}"/>`)
  lines.push(`              <successor id="${spec.toOdrLaneId}"/>`)
  lines.push(`            </link>`)
  lines.push(
    `            <width sOffset="0" a="${fmt(width)}" b="${widthSlope === 0 ? '0' : fmtPrecise(widthSlope)}" c="0" d="0"/>`
  )
  lines.push(`            <roadMark sOffset="0" type="none" weight="standard" color="white" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </right>`)
  lines.push(`      </laneSection>`)
  lines.push(`    </lanes>`)
  lines.push(`    <objects/>`)
  lines.push(`    <signals/>`)
  lines.push(`  </road>`)
  return lines.join('\n')
}

function emitLink(roadId: number, plan: ConnectivityPlan): string {
  const lines: string[] = []
  lines.push(`    <link>`)
  const pred = plan.roadPredecessor.get(roadId)
  if (pred) {
    lines.push(
      pred.kind === 'junction'
        ? `      <predecessor elementType="junction" elementId="${pred.id}"/>`
        : `      <predecessor elementType="road" elementId="${pred.id}" contactPoint="end"/>`
    )
  }
  const succ = plan.roadSuccessor.get(roadId)
  if (succ) {
    lines.push(
      succ.kind === 'junction'
        ? `      <successor elementType="junction" elementId="${succ.id}"/>`
        : `      <successor elementType="road" elementId="${succ.id}" contactPoint="start"/>`
    )
  }
  lines.push(`    </link>`)
  return lines.join('\n')
}

function projectToRoad(geom: BundleGeometry, xG: number, yG: number): {
  s: number
  t: number
  hdg: number
  distance: number
  clampedAtEnd: boolean
} {
  let bestS = 0
  let bestT = 0
  let bestDist = Infinity
  let bestHdg = 0
  let bestClamped = false
  // The fitted sample poses lie on the analytic reference line, so chord
  // projection between them yields stations directly in the emitted s domain.
  const samples = geom.samplePoses
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]
    const b = samples[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    if (segLen < 1e-9) continue
    const ux = dx / segLen
    const uy = dy / segLen
    const px = xG - a.x
    const py = yG - a.y
    let tNorm = px * ux + py * uy
    let clamped = false
    if (tNorm < 0) {
      tNorm = 0
      clamped = i === 0
    }
    if (tNorm > segLen) {
      tNorm = segLen
      clamped = i === samples.length - 2
    }
    const projX = a.x + ux * tNorm
    const projY = a.y + uy * tNorm
    const dist = Math.hypot(xG - projX, yG - projY)
    if (dist < bestDist) {
      bestDist = dist
      bestS = a.s + (tNorm / segLen) * (b.s - a.s)
      const nx = -uy
      const ny = ux
      bestT = px * nx + py * ny
      bestHdg = Math.atan2(uy, ux)
      bestClamped = clamped
    }
  }
  return { s: bestS, t: bestT, hdg: bestHdg, distance: bestDist, clampedAtEnd: bestClamped }
}

/** Inclusive lane id range a signal applies to. */
interface ValidityRange {
  fromLane: number
  toLane: number
}

/** Contiguous <validity> ranges from a set of ODR lane ids. */
function laneIdRanges(ids: number[]): ValidityRange[] {
  const sorted = [...new Set(ids)].sort((a, b) => a - b)
  const ranges: ValidityRange[] = []
  if (sorted.length === 0) return ranges
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]
    if (v === prev + 1) {
      prev = v
      continue
    }
    ranges.push({ fromLane: start, toLane: prev })
    start = v
    prev = v
  }
  ranges.push({ fromLane: start, toLane: prev })
  return ranges
}

interface SignalEntry {
  id: number
  s: number
  t: number
  zOffset: number
  height: number
  width: number
  name: string
  type: string
  subtype: string
  /** Signal type catalog country; "OpenDRIVE" when omitted. */
  country?: string
  dynamic: 'yes' | 'no'
  orientation: '+' | '-'
  /** Lane ranges the signal applies to (regulatory layer); omitted = whole road. */
  validity?: ValidityRange[]
  /**
   * Stop line polyline in ENU meters, carried as <userData code="stopLine">
   * so the importer can rebuild the stop-line linestring and re-link it.
   */
  stopLinePoints?: { x: number; y: number }[]
  /** Additional <userData code value> records carried on the signal. */
  userData?: { code: string; value: string }[]
}

/**
 * <signalReference> record: re-applies a signal defined on another road to
 * this road (the standard mechanism for signals controlling several roads).
 */
interface SignalReferenceEntry {
  id: number
  s: number
  t: number
  orientation: '+' | '-'
  validity: ValidityRange[]
}

interface ObjectEntry {
  id: number
  s: number
  t: number
  zOffset: number
  hdg: number
  length: number
  width: number
  height: number
  name: string
  type: string
  orientation: '+' | '-' | 'none'
  outline?: { u: number; v: number }[]
  /** <userData code value> records carried on the object (regulatory links etc.). */
  userData?: { code: string; value: string }[]
}

function attachShapesToRoads(
  shapeMap: Map<string, BaseShape>,
  trafficLights: TrafficLightShape[],
  trafficSigns: TrafficSignShape[],
  crosswalks: CrosswalkShape[],
  polygons: { shape: PolygonShape; vertices: { x: number; y: number }[] }[],
  roads: { roadId: number; geom: BundleGeometry }[],
  laneIdToRoadId: Map<string, number>,
  laneIdToOdrLaneId: Map<string, number>,
  maxAttachDistanceMeter: number = 50,
  signalIdStart: number = 1
): {
  roadSignals: Map<number, SignalEntry[]>
  roadObjects: Map<number, ObjectEntry[]>
  /** <signalReference> records per road (signals affecting several roads). */
  roadSignalRefs: Map<number, SignalReferenceEntry[]>
  /** Emitted OpenDRIVE signal id per traffic light shape id (for <controller>). */
  signalIdByShape: Map<string, number>
} {
  const roadSignals = new Map<number, SignalEntry[]>()
  const roadObjects = new Map<number, ObjectEntry[]>()
  const roadSignalRefs = new Map<number, SignalReferenceEntry[]>()
  const signalIdByShape = new Map<string, number>()
  let signalIdCounter = signalIdStart
  let objectIdCounter = 1

  const geomByRoadId = new Map<number, BundleGeometry>()
  for (const r of roads) geomByRoadId.set(r.roadId, r.geom)

  /** Affected lanes grouped per road: road id -> ODR lane ids. */
  const affectedLanesByRoad = (laneShapeIds: readonly string[] | undefined): Map<number, number[]> => {
    const byRoad = new Map<number, number[]>()
    for (const laneShapeId of laneShapeIds ?? []) {
      const rid = laneIdToRoadId.get(laneShapeId)
      const oid = laneIdToOdrLaneId.get(laneShapeId)
      if (rid === undefined || oid === undefined) continue
      const list = byRoad.get(rid) ?? []
      if (!list.includes(oid)) list.push(oid)
      byRoad.set(rid, list)
    }
    return byRoad
  }

  // Traffic lights (dynamic signals) and traffic signs (static signals)
  // attach to roads through the same projection / validity machinery; only
  // the emitted <signal> attributes differ per kind.
  const signalShapes: (
    | { kind: 'traffic_light'; shape: TrafficLightShape }
    | { kind: 'traffic_sign'; shape: TrafficSignShape }
  )[] = [
    ...trafficLights.map(shape => ({ kind: 'traffic_light' as const, shape })),
    ...trafficSigns.map(shape => ({ kind: 'traffic_sign' as const, shape })),
  ]
  for (const { kind, shape: tl } of signalShapes) {
    const xG = pxToEnuX(tl.x)
    const yG = pxToEnuY(tl.y)

    // Regulatory layer: a signal that names affected lanes attaches to the
    // nearest of those lanes' roads and carries <validity> records for the
    // affected lane range. Distance gating does not apply — the assignment is
    // explicit.
    const affectedByRoad = affectedLanesByRoad(tl.props.affectedLaneIds)
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    if (affectedByRoad.size > 0) {
      for (const r of roads) {
        if (!affectedByRoad.has(r.roadId)) continue
        const proj = projectToRoad(r.geom, xG, yG)
        if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
      }
    } else {
      // Fall back to the nearest road within the attachment distance.
      for (const r of roads) {
        const proj = projectToRoad(r.geom, xG, yG)
        if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
      }
      if (best && best.proj.distance > maxAttachDistanceMeter) best = null
    }
    if (!best) continue
    const heightM = pxToMeter(tl.props.h)
    const widthM = pxToMeter(tl.props.w)
    const list = roadSignals.get(best.roadId) ?? []
    let entry: SignalEntry
    if (kind === 'traffic_light') {
      const style = (tl.props as TrafficLightProps).style ?? ''
      const isPed = style.startsWith('pedestrian') || style.includes('ped')
      // Conventional signal type codes: 1000001 = vehicle, 1000002 = pedestrian.
      const sigType = isPed ? '1000002' : '1000001'
      entry = {
        id: signalIdCounter++,
        s: best.proj.s,
        t: best.proj.t,
        zOffset: isPed ? 1.5 : 4.5,
        height: heightM,
        width: widthM,
        name: style,
        type: sigType,
        subtype: '-1',
        dynamic: 'yes',
        orientation: best.proj.t >= 0 ? '+' : '-',
      }
    } else {
      // Static traffic sign: reuse the exact OpenDRIVE type / subtype /
      // country recorded at import time; fresh signs fall back to type "-1"
      // with the sign code as the name. Full attribute round-trip rides on
      // <userData code="signAttributes">.
      const attrs = (tl.props.attributes ?? {}) as Record<string, string | undefined>
      entry = {
        id: signalIdCounter++,
        s: best.proj.s,
        t: best.proj.t,
        zOffset: 2,
        height: heightM,
        width: widthM,
        name: trafficSignCode(attrs),
        type: attrs.odr_signal_type || '-1',
        subtype: attrs.odr_signal_subtype || '-1',
        country: attrs.odr_country || undefined,
        dynamic: 'no',
        orientation: best.proj.t >= 0 ? '+' : '-',
      }
      const stash: Record<string, string> = {}
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'type' || k === 'refers_osm_id' || k.startsWith('odr_')) continue
        if (v === undefined || v === null || v === '') continue
        stash[k] = String(v)
      }
      if (Object.keys(stash).length > 0) {
        entry.userData = [{ code: 'signAttributes', value: JSON.stringify(stash) }]
      }
    }
    if (affectedByRoad.size > 0) {
      entry.validity = laneIdRanges(affectedByRoad.get(best.roadId)!)
    }
    list.push(entry)
    roadSignals.set(best.roadId, list)
    signalIdByShape.set(tl.id, entry.id)

    // A signal controlling lanes in several road bundles cannot carry a
    // single <validity> (it cannot cross roads); the remaining affected roads
    // get a standard <signalReference> pointing back at the signal with their
    // own lane ranges, so the validity links survive a round trip.
    if (affectedByRoad.size > 1) {
      for (const r of roads) {
        if (r.roadId === best.roadId || !affectedByRoad.has(r.roadId)) continue
        const proj = projectToRoad(r.geom, xG, yG)
        const refs = roadSignalRefs.get(r.roadId) ?? []
        refs.push({
          id: entry.id,
          s: proj.s,
          t: proj.t,
          orientation: proj.t >= 0 ? '+' : '-',
          validity: laneIdRanges(affectedByRoad.get(r.roadId)!),
        })
        roadSignalRefs.set(r.roadId, refs)
      }
    }

    // Stop line: emitted on the signal's road as a conventional
    // <object name="StopLine"> at the projected station of the line's midpoint.
    if (tl.props.stopLineId) {
      const stopLs = shapeMap.get(tl.props.stopLineId) as unknown as LinestringShape | undefined
      const pts = stopLs
        ? collectPoints(shapeMap, stopLs.props.pointIds, false, new Map())
        : []
      if (pts.length >= 2) {
        // Carry the full polyline (ENU meters) on the signal so an importer
        // can rebuild the stop-line linestring and re-link it to the signal.
        entry.stopLinePoints = pts.map((p) => ({ x: pxToEnuX(p.x), y: pxToEnuY(p.y) }))
        const a = pts[0]
        const b = pts[pts.length - 1]
        const midX = pxToEnuX((a.x + b.x) / 2)
        const midY = pxToEnuY((a.y + b.y) / 2)
        const geom = geomByRoadId.get(best.roadId)!
        const proj = projectToRoad(geom, midX, midY)
        const objList = roadObjects.get(best.roadId) ?? []
        objList.push({
          id: objectIdCounter++,
          s: proj.s,
          t: proj.t,
          zOffset: 0,
          // Stop lines lie across the road (like crosswalks): local hdg = π/2,
          // length spanning the painted line, conventional 0.3 m paint width.
          hdg: Math.PI / 2,
          length: pxToMeter(Math.hypot(b.x - a.x, b.y - a.y)),
          width: 0.3,
          height: 0,
          name: 'StopLine',
          type: 'none',
          orientation: 'none',
        })
        roadObjects.set(best.roadId, objList)
      }
    }
  }

  for (const cw of crosswalks) {
    const rotDeg = cw.rotation || 0
    const rotRad = (rotDeg * Math.PI) / 180
    const cosR = Math.cos(rotRad)
    const sinR = Math.sin(rotRad)
    const cxLocal = (cw.props.startX + cw.props.endX) / 2
    const cyLocal = (cw.props.startY + cw.props.endY) / 2
    const cxGlobal = cw.x + cxLocal
    const cyGlobal = cw.y + cyLocal
    const xG = pxToEnuX(cxGlobal)
    const yG = pxToEnuY(cyGlobal)
    // Regulatory layer: a crosswalk that names affected lanes attaches to the
    // nearest of those lanes' roads (no distance gate — the assignment is
    // explicit), mirroring the signal behavior above.
    const affectedByRoad = affectedLanesByRoad(cw.props.affectedLaneIds)
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    if (affectedByRoad.size > 0) {
      for (const r of roads) {
        if (!affectedByRoad.has(r.roadId)) continue
        const proj = projectToRoad(r.geom, xG, yG)
        if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
      }
    } else {
      for (const r of roads) {
        const proj = projectToRoad(r.geom, xG, yG)
        if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
      }
      if (best && best.proj.distance > maxAttachDistanceMeter) best = null
    }
    if (!best) continue
    const dxLocal = cw.props.endX - cw.props.startX
    const dyLocal = cw.props.endY - cw.props.startY
    const lengthM = pxToMeter(Math.hypot(dxLocal, dyLocal))
    const widthM = pxToMeter(cw.props.crosswalkWidth)
    // Apply shape rotation to the local axis to obtain the global axis.
    const dxPx = dxLocal * cosR - dyLocal * sinR
    const dyPx = dxLocal * sinR + dyLocal * cosR
    const cwEnuHdg = Math.atan2(-dyPx, dxPx)
    let relativeHdg = cwEnuHdg - best.proj.hdg
    while (relativeHdg > Math.PI) relativeHdg -= 2 * Math.PI
    while (relativeHdg < -Math.PI) relativeHdg += 2 * Math.PI
    const list = roadObjects.get(best.roadId) ?? []
    // The OpenDRIVE crosswalk object renders perpendicular to the road when
    // hdg = π/2 (verified empirically on east-west and north-south roads).
    // Crosswalks are by convention placed across the road, so we always emit
    // π/2 regardless of the user-drawn axis direction.
    void relativeHdg
    const crosswalkHdg = Math.PI / 2
    // Regulatory links (affected lanes + stop line polyline) ride along as
    // <userData> — OpenDRIVE's standard extension mechanism — so they survive
    // an .xodr round trip. Coordinates are ENU meters.
    const userData: { code: string; value: string }[] = []
    if (affectedByRoad.size > 0) {
      const affectedLanes: [string, string][] = []
      for (const [rid, ids] of [...affectedByRoad.entries()].sort((a, b) => a[0] - b[0])) {
        for (const oid of [...ids].sort((a, b) => a - b)) {
          affectedLanes.push([String(rid), String(oid)])
        }
      }
      const links: { affectedLanes: [string, string][]; stopLine?: number[][] } = {
        affectedLanes,
      }
      if (cw.props.stopLineId) {
        const stopLs = shapeMap.get(cw.props.stopLineId) as unknown as LinestringShape | undefined
        const pts = stopLs ? collectPoints(shapeMap, stopLs.props.pointIds, false, new Map()) : []
        if (pts.length >= 2) {
          links.stopLine = pts.map((p) => [roundMm(pxToEnuX(p.x)), roundMm(pxToEnuY(p.y))])
        }
      }
      userData.push({ code: 'crosswalkLinks', value: JSON.stringify(links) })
    }
    list.push({
      id: objectIdCounter++,
      s: best.proj.s,
      t: best.proj.t,
      zOffset: 0,
      hdg: crosswalkHdg,
      length: lengthM,
      width: widthM,
      height: 0,
      name: 'crosswalk',
      type: 'crosswalk',
      orientation: 'none',
      userData: userData.length ? userData : undefined,
    })
    roadObjects.set(best.roadId, list)
  }

  // Polygons (e.g. intersection patches) are emitted as <object type="patch">
  // + <outlines>/<outline>/<cornerLocal>. The centroid is projected onto the
  // nearest road; vertices are transformed into the road's local (u, v) frame.
  for (const { shape: poly, vertices } of polygons) {
    if (vertices.length < 3) continue
    let cx = 0
    let cy = 0
    for (const v of vertices) {
      cx += v.x
      cy += v.y
    }
    cx /= vertices.length
    cy /= vertices.length
    const xG = pxToEnuX(cx)
    const yG = pxToEnuY(cy)
    let best: { roadId: number; geom: BundleGeometry; proj: ReturnType<typeof projectToRoad> } | null = null
    let fallback: { roadId: number; geom: BundleGeometry; proj: ReturnType<typeof projectToRoad> } | null = null
    for (const r of roads) {
      const proj = projectToRoad(r.geom, xG, yG)
      if (proj.clampedAtEnd) {
        if (!fallback || proj.distance < fallback.proj.distance) {
          fallback = { roadId: r.roadId, geom: r.geom, proj }
        }
        continue
      }
      if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, geom: r.geom, proj }
    }
    if (!best) best = fallback
    if (!best || best.proj.distance > maxAttachDistanceMeter) continue
    const cosH = Math.cos(best.proj.hdg)
    const sinH = Math.sin(best.proj.hdg)
    const samples = best.geom.samplePoses
    const anchorPoint = best.proj.clampedAtEnd && best.proj.s >= samples[samples.length - 1].s - 1e-6
      ? samples[samples.length - 1]
      : samples[0]
    const anchorEnuX = anchorPoint.x
    const anchorEnuY = anchorPoint.y
    const anchorS = anchorPoint.s
    const outline: { u: number; v: number }[] = []
    for (const v of vertices) {
      const vxG = pxToEnuX(v.x)
      const vyG = pxToEnuY(v.y)
      const dx = vxG - anchorEnuX
      const dy = vyG - anchorEnuY
      const u = dx * cosH + dy * sinH
      const vv = -dx * sinH + dy * cosH
      outline.push({ u, v: vv })
    }
    const list = roadObjects.get(best.roadId) ?? []
    const subtype = (poly.props.attributes as Record<string, unknown> | undefined)?.subtype
    list.push({
      id: objectIdCounter++,
      s: anchorS,
      t: 0,
      // Lift 5 cm above the road surface to avoid z-fighting where the
      // patch overlaps multiple roads at z=0.
      zOffset: 0.05,
      hdg: 0,
      length: 0,
      width: 0,
      height: 0,
      name: typeof subtype === 'string' ? subtype : 'polygon',
      type: 'patch',
      orientation: 'none',
      outline,
    })
    roadObjects.set(best.roadId, list)
  }

  return { roadSignals, roadObjects, roadSignalRefs, signalIdByShape }
}

function emitSignals(signals: SignalEntry[], references: SignalReferenceEntry[]): string {
  if (!signals.length && !references.length) return `    <signals/>`
  const lines: string[] = []
  lines.push(`    <signals>`)
  for (const s of signals) {
    const attrs = `id="${s.id}" s="${fmt(s.s)}" t="${fmt(s.t)}" zOffset="${fmt(s.zOffset)}" name="${escapeXml(s.name)}" dynamic="${s.dynamic}" orientation="${s.orientation}" type="${s.type}" subtype="${s.subtype}" country="${escapeXml(s.country ?? 'OpenDRIVE')}" value="0" height="${fmt(s.height)}" width="${fmt(s.width)}"`
    if (s.validity?.length || s.stopLinePoints || s.userData?.length) {
      lines.push(`      <signal ${attrs}>`)
      for (const v of s.validity ?? []) {
        lines.push(`        <validity fromLane="${v.fromLane}" toLane="${v.toLane}"/>`)
      }
      if (s.stopLinePoints) {
        const json = JSON.stringify(
          s.stopLinePoints.map((p) => [roundMm(p.x), roundMm(p.y)])
        )
        lines.push(`        <userData code="stopLine" value="${escapeXml(json)}"/>`)
      }
      for (const ud of s.userData ?? []) {
        lines.push(`        <userData code="${escapeXml(ud.code)}" value="${escapeXml(ud.value)}"/>`)
      }
      lines.push(`      </signal>`)
    } else {
      lines.push(`      <signal ${attrs}/>`)
    }
  }
  for (const ref of references) {
    lines.push(
      `      <signalReference s="${fmt(ref.s)}" t="${fmt(ref.t)}" id="${ref.id}" orientation="${ref.orientation}">`
    )
    for (const v of ref.validity) {
      lines.push(`        <validity fromLane="${v.fromLane}" toLane="${v.toLane}"/>`)
    }
    lines.push(`      </signalReference>`)
  }
  lines.push(`    </signals>`)
  return lines.join('\n')
}

/** Round to millimeter precision for compact embedded JSON. */
function roundMm(v: number): number {
  return Math.round(v * 1000) / 1000
}

function emitObjects(objects: ObjectEntry[]): string {
  if (!objects.length) return `    <objects/>`
  const lines: string[] = []
  lines.push(`    <objects>`)
  for (const o of objects) {
    if (o.outline && o.outline.length >= 3) {
      lines.push(
        `      <object id="${o.id}" s="${fmt(o.s)}" t="${fmt(o.t)}" zOffset="${fmt(o.zOffset)}" hdg="${fmt(o.hdg)}" name="${escapeXml(o.name)}" type="${o.type}" orientation="${o.orientation}" length="0" width="0" height="0">`
      )
      lines.push(`        <outlines>`)
      lines.push(`          <outline id="0" closed="true">`)
      o.outline.forEach((p, i) => {
        // height=0.001 (1 mm) gives the patch a tiny vertical thickness so
        // its top and bottom faces sit on different z planes (avoids z-fighting).
        lines.push(
          `            <cornerLocal id="${i}" u="${fmt(p.u)}" v="${fmt(p.v)}" z="0" height="0.001"/>`
        )
      })
      lines.push(`          </outline>`)
      lines.push(`        </outlines>`)
      lines.push(`      </object>`)
    } else {
      const attrs = `id="${o.id}" s="${fmt(o.s)}" t="${fmt(o.t)}" zOffset="${fmt(o.zOffset)}" hdg="${fmt(o.hdg)}" name="${escapeXml(o.name)}" type="${o.type}" orientation="${o.orientation}" length="${fmt(o.length)}" width="${fmt(o.width)}" height="${fmt(o.height)}"`
      if (o.userData?.length) {
        lines.push(`      <object ${attrs}>`)
        for (const ud of o.userData) {
          lines.push(`        <userData code="${escapeXml(ud.code)}" value="${escapeXml(ud.value)}"/>`)
        }
        lines.push(`      </object>`)
      } else {
        lines.push(`      <object ${attrs}/>`)
      }
    }
  }
  lines.push(`    </objects>`)
  return lines.join('\n')
}

/**
 * Lane attributes that have no OpenDRIVE representation (speed_limit only
 * partially maps, one_way / turn_direction / location and custom tags not at
 * all) are stashed as JSON in <userData code="laneAttributes"> — OpenDRIVE's
 * standard extension mechanism — keyed by the lane's ODR id so per-lane
 * attributes stay separate in multi-lane roads, and restored by the importer.
 * `odr_*` meta attributes are excluded: they are regenerated on import.
 */
function emitLaneAttributesUserData(bundleLanes: LaneShape[]): string | null {
  const byLane: Record<string, Record<string, string>> = {}
  bundleLanes.forEach((lane, i) => {
    const stash: Record<string, string> = {}
    for (const [k, v] of Object.entries(lane.props.attributes ?? {})) {
      if (k === 'type' || k.startsWith('odr_')) continue
      if (v === undefined || v === null || v === '') continue
      stash[k] = String(v)
    }
    if (Object.keys(stash).length > 0) byLane[String(-(i + 1))] = stash
  })
  if (Object.keys(byLane).length === 0) return null
  return `    <userData code="laneAttributes" value="${escapeXml(JSON.stringify(byLane))}"/>`
}

/**
 * Right-of-way links (`yieldLaneIds`) between two lanes that both feed a
 * connecting road of the same junction are expressed as standard junction
 * <priority> records (see planConnectivity); every remaining link is stashed
 * in <userData code="yieldLanes"> as { ownLaneId: [[roadId, laneId], ...] }
 * and restored by the importer.
 */
function emitYieldLanesUserData(
  bundleLanes: LaneShape[],
  laneIdToRoadId: Map<string, number>,
  laneIdToOdrLaneId: Map<string, number>,
  handledYieldPairs: Set<string>
): string | null {
  const byLane: Record<string, [string, string][]> = {}
  bundleLanes.forEach((lane, i) => {
    const targets: [string, string][] = []
    for (const yieldShapeId of lane.props.yieldLaneIds ?? []) {
      if (handledYieldPairs.has(`${lane.id}|${yieldShapeId}`)) continue
      const rid = laneIdToRoadId.get(yieldShapeId)
      const oid = laneIdToOdrLaneId.get(yieldShapeId)
      if (rid === undefined || oid === undefined) continue
      if (!targets.some(t => t[0] === String(rid) && t[1] === String(oid))) {
        targets.push([String(rid), String(oid)])
      }
    }
    if (targets.length > 0) {
      targets.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[1]) - Number(b[1]))
      byLane[String(-(i + 1))] = targets
    }
  })
  if (Object.keys(byLane).length === 0) return null
  return `    <userData code="yieldLanes" value="${escapeXml(JSON.stringify(byLane))}"/>`
}

/**
 * Zero-width-contact lane edges homed on this road (see
 * ConnectivityPlan.hiddenLaneEdges), stashed as
 * <userData code="hiddenLaneLinks"> records of
 * { fr, fl, tr, tl } = from road id / from ODR lane id / to road id /
 * to ODR lane id (from end -> to start in travel direction), and restored
 * into next/prev by the importer.
 */
function emitHiddenLinksUserData(
  bundleLanes: LaneShape[],
  plan: ConnectivityPlan,
  laneIdToRoadId: Map<string, number>,
  laneIdToOdrLaneId: Map<string, number>
): string | null {
  const inBundle = new Set(bundleLanes.map(l => l.id))
  const recs: { fr: number; fl: number; tr: number; tl: number }[] = []
  for (const e of plan.hiddenLaneEdges) {
    if (!inBundle.has(e.home)) continue
    const fr = laneIdToRoadId.get(e.from)
    const fl = laneIdToOdrLaneId.get(e.from)
    const tr = laneIdToRoadId.get(e.to)
    const tl = laneIdToOdrLaneId.get(e.to)
    if (fr === undefined || fl === undefined || tr === undefined || tl === undefined) continue
    recs.push({ fr, fl, tr, tl })
  }
  if (recs.length === 0) return null
  recs.sort((a, b) => a.fr - b.fr || a.fl - b.fl || a.tr - b.tr || a.tl - b.tl)
  return `    <userData code="hiddenLaneLinks" value="${escapeXml(JSON.stringify(recs))}"/>`
}

/**
 * Road length attribute. The plan-view geometries are emitted with rounded
 * (6-decimal) s/length values whose cumulative extent can exceed the exact
 * road length by ~1e-6, which strict consumers flag as "s too large". Use the
 * emitted extent plus a tiny pad so the length always covers the geometry.
 */
function emittedRoadLength(geom: BundleGeometry): number {
  let extent = geom.length
  for (const g of geom.planView) {
    const end = parseFloat(fmt(g.s)) + parseFloat(fmt(g.length))
    if (end > extent) extent = end
  }
  return extent + 1e-4
}

function emitRoad(
  bundle: ExportBundle,
  roadId: number,
  plan: ConnectivityPlan,
  signals: SignalEntry[],
  signalRefs: SignalReferenceEntry[],
  objects: ObjectEntry[],
  shapeMap: Map<string, BaseShape>,
  laneIdToRoadId: Map<string, number>,
  laneIdToOdrLaneId: Map<string, number>
): string {
  const first = bundle.lanes[0]
  const speed = bundle.lanes.find(l => l.props.attributes?.speed_limit)?.props.attributes?.speed_limit
  const name = escapeXml(first.props.attributes?.subtype || 'road')
  const lines: string[] = []
  // Mainline (bundle) roads never belong to a junction; junction membership
  // is carried by the synthesized connecting roads (emitConnectingRoad).
  lines.push(
    `  <road name="${name}" length="${fmt(emittedRoadLength(bundle.geom))}" id="${roadId}" junction="-1">`
  )
  lines.push(emitLink(roadId, plan))
  if (speed) {
    lines.push(`    <type s="0" type="town">`)
    lines.push(`      <speed max="${escapeXml(speed)}" unit="km/h"/>`)
    lines.push(`    </type>`)
  }
  lines.push(emitPlanView(bundle.geom))
  lines.push(emitElevationProfile(bundle.geom))
  lines.push(`    <lateralProfile/>`)
  lines.push(emitLanes(bundle, plan, shapeMap))
  lines.push(emitObjects(objects))
  lines.push(emitSignals(signals, signalRefs))
  const userData = emitLaneAttributesUserData(bundle.lanes)
  if (userData) lines.push(userData)
  const yieldUserData = emitYieldLanesUserData(
    bundle.lanes,
    laneIdToRoadId,
    laneIdToOdrLaneId,
    plan.handledYieldPairs
  )
  if (yieldUserData) lines.push(yieldUserData)
  const hiddenLinksUserData = emitHiddenLinksUserData(
    bundle.lanes,
    plan,
    laneIdToRoadId,
    laneIdToOdrLaneId
  )
  if (hiddenLinksUserData) lines.push(hiddenLinksUserData)
  lines.push(`  </road>`)
  return lines.join('\n')
}

/** Empty point-override map (raw stored coordinates). */
const NO_OVERRIDES: Map<string, Point2D> = new Map()

export interface OpenDriveExportOptions {
  /**
   * Sidecar captured by the OpenDRIVE importer. When present (with road
   * records), roads whose shapes were not edited since import are re-emitted
   * verbatim from the original XML (carry-through) and only edited roads are
   * regenerated. Without a sidecar the export is fully regenerated.
   */
  sidecar?: OdrSidecar | null
}

/** Carry-through plan: which original elements stay verbatim. */
interface CarryPlan {
  doc: OdrDocument
  records: Record<string, OdrRoadRecord>
  /** Recorded road ids whose state hash still matches (emitted verbatim). */
  cleanRoadIds: Set<string>
  /** Recorded road ids that must be regenerated. */
  dirtyRecordedIds: Set<string>
  /** Lane shape ids covered by verbatim roads (excluded from regeneration). */
  verbatimLaneIds: Set<string>
  /** Traffic light / crosswalk shape ids covered by verbatim roads. */
  consumedShapeIds: Set<string>
  headerText: string | null
  verbatimRoads: OdrDocRoad[]
  /** Original junction ids that must be regenerated (members changed). */
  dirtyJunctionIds: Set<string>
  verbatimJunctionTexts: string[]
  verbatimControllerTexts: string[]
  /** First id for regenerated roads / junctions (above every original id). */
  idBase: number
  signalIdBase: number
  controllerIdBase: number
}

/**
 * Decide which original roads can be re-emitted verbatim.
 *
 * A recorded road is clean when every lane shape it produced still exists and
 * the state hash recomputed from the live shapes equals the import-time hash
 * (geometry, attributes, connectivity, right-of-way, and the regulatory
 * shapes touching the road — see odrCarryThrough.ts).
 *
 * Dirtiness then propagates until stable:
 * - A junction is dirty when any member road (connecting roads, incoming /
 *   outgoing roads, roads linking to the junction) is dirty or unrecorded.
 *   A dirty junction regenerates together with its CONNECTING
 *   (junction-stamped) roads, whose connection table it replaces; clean
 *   incoming / outgoing roads stay verbatim and their junction link
 *   elementIds are re-pointed at the regenerated junction on emission.
 * - Regulatory shapes are atomic: a traffic light / crosswalk touching a
 *   dirty road dirties every road it touches, so its signal + references are
 *   either all verbatim or all regenerated.
 *
 * Roads referencing unrecorded elements (e.g. a selective import) are never
 * carried verbatim, so verbatim output cannot dangle into missing roads.
 */
function planCarryThrough(
  sidecar: OdrSidecar | null | undefined,
  shapeMap: Map<string, BaseShape>,
  trafficLights: TrafficLightShape[],
  trafficSigns: TrafficSignShape[],
  crosswalks: CrosswalkShape[]
): CarryPlan | null {
  const records = sidecar?.roadRecords
  if (!sidecar || !records || Object.keys(records).length === 0) return null
  const doc = extractOdrDocument(sidecar.rawXml)
  if (!doc) return null
  const docRoadById = new Map(doc.roads.map(r => [r.id, r]))
  const docJunctionById = new Map(doc.junctions.map(j => [j.id, j]))

  // laneShapeId -> recorded road id (over every record).
  const laneRoadOf = new Map<string, string>()
  for (const [rid, rec] of Object.entries(records)) {
    for (const lid of rec.laneShapeIds) laneRoadOf.set(lid, rid)
  }

  const stopLinePts = (lsId: string | null | undefined): Point2D[] | null => {
    if (!lsId) return null
    const ls = shapeMap.get(lsId) as unknown as LinestringShape | undefined
    if (!ls) return null
    const pts = collectPoints(shapeMap, ls.props.pointIds, false, NO_OVERRIDES)
    return pts.length >= 2 ? pts : null
  }

  // Regulatory shapes: state + the set of recorded roads each one touches
  // (mirrors the importer's record builder).
  const regStatesByRoad = new Map<string, CarryRegulatoryState[]>()
  const regShapes: { shapeId: string; touching: Set<string> }[] = []
  const addRegState = (
    state: CarryRegulatoryState,
    affected: readonly string[],
    own: string | undefined
  ): void => {
    const touching = new Set<string>()
    if (own && records[own]) touching.add(own)
    for (const lid of affected) {
      const rid = laneRoadOf.get(lid)
      if (rid) touching.add(rid)
    }
    for (const rid of touching) {
      const list = regStatesByRoad.get(rid) ?? []
      list.push(state)
      regStatesByRoad.set(rid, list)
    }
    regShapes.push({ shapeId: state.shapeId, touching })
  }
  for (const tl of trafficLights) {
    addRegState(
      {
        kind: 'traffic_light',
        shapeId: tl.id,
        numbers: [tl.x, tl.y, tl.props.w, tl.props.h, tl.rotation || 0],
        attributes: tl.props.attributes ?? {},
        affectedLaneIds: tl.props.affectedLaneIds ?? [],
        stopLinePts: stopLinePts(tl.props.stopLineId),
        controllerId: tl.props.controllerId ?? '',
      },
      tl.props.affectedLaneIds ?? [],
      tl.props.attributes?.odr_road_id
    )
  }
  for (const ts of trafficSigns) {
    addRegState(
      {
        kind: 'traffic_sign',
        shapeId: ts.id,
        numbers: [ts.x, ts.y, ts.props.w, ts.props.h, ts.rotation || 0],
        attributes: ts.props.attributes ?? {},
        affectedLaneIds: ts.props.affectedLaneIds ?? [],
        stopLinePts: stopLinePts(ts.props.stopLineId),
        controllerId: '',
      },
      ts.props.affectedLaneIds ?? [],
      ts.props.attributes?.odr_road_id
    )
  }
  for (const cw of crosswalks) {
    addRegState(
      {
        kind: 'crosswalk',
        shapeId: cw.id,
        numbers: [
          cw.x,
          cw.y,
          cw.props.startX,
          cw.props.startY,
          cw.props.endX,
          cw.props.endY,
          cw.props.crosswalkWidth,
          cw.rotation || 0,
        ],
        attributes: cw.props.attributes ?? {},
        affectedLaneIds: cw.props.affectedLaneIds ?? [],
        stopLinePts: stopLinePts(cw.props.stopLineId),
        controllerId: '',
      },
      cw.props.affectedLaneIds ?? [],
      cw.props.attributes?.odr_road_id
    )
  }

  // Export-side lane states (null when any recorded lane shape is missing).
  const exportLaneStates = (rec: OdrRoadRecord): CarryLaneState[] | null => {
    const states: CarryLaneState[] = []
    for (const lid of rec.laneShapeIds) {
      const shape = shapeMap.get(lid)
      if (!shape || shape.type !== 'lane') return null
      const lane = shape as unknown as LaneShape
      states.push({
        leftPts: boundaryPointsOf(shapeMap, lane.props.leftBoundaryId, lane.props.invertLeft, NO_OVERRIDES),
        rightPts: boundaryPointsOf(shapeMap, lane.props.rightBoundaryId, lane.props.invertRight, NO_OVERRIDES),
        attributes: lane.props.attributes ?? {},
        next: lane.props.next ?? [],
        prev: lane.props.prev ?? [],
        yieldLaneIds: lane.props.yieldLaneIds ?? [],
      })
    }
    return states
  }

  // Seed dirtiness: hash mismatch, missing shapes, or references that leave
  // the recorded set.
  const dirty = new Set<string>()
  for (const [rid, rec] of Object.entries(records)) {
    const docRoad = docRoadById.get(rid)
    if (!docRoad) {
      dirty.add(rid)
      continue
    }
    if (
      docRoad.linkRoadRefs.some(ref => !records[ref]) ||
      docRoad.linkJunctionRefs.some(ref => !docJunctionById.has(ref))
    ) {
      dirty.add(rid)
      continue
    }
    const laneStates = exportLaneStates(rec)
    if (!laneStates || hashRoadState(laneStates, regStatesByRoad.get(rid) ?? []) !== rec.stateHash) {
      dirty.add(rid)
    }
  }

  // Junction membership: connection roads, junction-stamped roads (plus
  // their link targets — the maneuver's incoming/outgoing roads), and roads
  // whose link references the junction.
  const members = new Map<string, Set<string>>()
  const junctionStamped = new Map<string, Set<string>>()
  for (const j of doc.junctions) {
    members.set(j.id, new Set(j.memberRoadIds))
    junctionStamped.set(j.id, new Set())
  }
  for (const r of doc.roads) {
    if (r.junction !== '-1') {
      const set = members.get(r.junction)
      if (set) {
        set.add(r.id)
        for (const ref of r.linkRoadRefs) set.add(ref)
        junctionStamped.get(r.junction)!.add(r.id)
      }
    }
    for (const jref of r.linkJunctionRefs) members.get(jref)?.add(r.id)
  }

  // Propagate to a fixpoint. A dirty junction drags only its connecting
  // (junction-stamped) roads into regeneration — clean incoming / outgoing
  // roads keep their verbatim text (with the junction link id rewritten) —
  // so a single edited road regenerates its own junctions, not the whole
  // junction graph. Regulatory shapes are atomic across the roads they touch.
  const dirtyJunctionIds = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const [jid, memberSet] of members) {
      let bad = false
      for (const m of memberSet) {
        if (!records[m] || dirty.has(m)) {
          bad = true
          break
        }
      }
      if (!bad) continue
      if (!dirtyJunctionIds.has(jid)) {
        dirtyJunctionIds.add(jid)
        changed = true
      }
      for (const m of junctionStamped.get(jid) ?? []) {
        if (records[m] && !dirty.has(m)) {
          dirty.add(m)
          changed = true
        }
      }
    }
    for (const reg of regShapes) {
      let bad = false
      for (const rid of reg.touching) {
        if (dirty.has(rid)) {
          bad = true
          break
        }
      }
      if (!bad) continue
      for (const rid of reg.touching) {
        if (!dirty.has(rid)) {
          dirty.add(rid)
          changed = true
        }
      }
    }
  }

  const cleanRoadIds = new Set<string>()
  for (const rid of Object.keys(records)) {
    if (!dirty.has(rid) && docRoadById.has(rid)) cleanRoadIds.add(rid)
  }

  const verbatimLaneIds = new Set<string>()
  for (const rid of cleanRoadIds) {
    for (const lid of records[rid].laneShapeIds) verbatimLaneIds.add(lid)
  }

  const consumedShapeIds = new Set<string>()
  for (const reg of regShapes) {
    if (reg.touching.size === 0) continue
    let allClean = true
    for (const rid of reg.touching) {
      if (!cleanRoadIds.has(rid)) {
        allClean = false
        break
      }
    }
    if (allClean) consumedShapeIds.add(reg.shapeId)
  }

  const verbatimRoads: OdrDocRoad[] = []
  for (const r of doc.roads) {
    if (cleanRoadIds.has(r.id)) verbatimRoads.push(r)
  }

  const verbatimJunctionTexts: string[] = []
  for (const j of doc.junctions) {
    if (!dirtyJunctionIds.has(j.id)) verbatimJunctionTexts.push(j.text)
  }

  // A controller stays verbatim when every signal it controls is defined in
  // a verbatim road.
  const signalRoadOf = new Map<string, string>()
  for (const r of doc.roads) {
    for (const sid of r.signalIds) signalRoadOf.set(sid, r.id)
  }
  const verbatimControllerTexts: string[] = []
  for (const c of doc.controllers) {
    const ok =
      c.signalIds.length > 0 &&
      c.signalIds.every(sid => {
        const rid = signalRoadOf.get(sid)
        return rid !== undefined && cleanRoadIds.has(rid)
      })
    if (ok) verbatimControllerTexts.push(c.text)
  }

  return {
    doc,
    records,
    cleanRoadIds,
    dirtyRecordedIds: dirty,
    verbatimLaneIds,
    consumedShapeIds,
    headerText: doc.headerText,
    verbatimRoads,
    dirtyJunctionIds,
    verbatimJunctionTexts,
    verbatimControllerTexts,
    idBase: Math.max(doc.maxNumericElementId, 0) + 1,
    signalIdBase: Math.max(doc.maxNumericSignalId, 0) + 1,
    controllerIdBase: Math.max(doc.maxNumericControllerId, 0) + 1,
  }
}

/**
 * Build an OpenDRIVE 1.8 XML document from a snapshot.
 *
 * With `options.sidecar` (captured by the OpenDRIVE importer), unedited
 * roads are re-emitted verbatim from the original XML; see planCarryThrough.
 */
export function exportToOpenDrive(snapshot: DrawtonomySnapshot, options: OpenDriveExportOptions = {}): string {
  const shapes = snapshot.shapes
  const shapeMap = buildShapeMap(shapes)
  const lanes: LaneShape[] = []
  const trafficLights: TrafficLightShape[] = []
  const trafficSigns: TrafficSignShape[] = []
  const crosswalks: CrosswalkShape[] = []
  const polygons: { shape: PolygonShape; vertices: { x: number; y: number }[] }[] = []
  for (const s of shapes) {
    if (s.type === 'lane') lanes.push(s as unknown as LaneShape)
    else if (s.type === 'traffic_light') trafficLights.push(s as unknown as TrafficLightShape)
    else if (s.type === 'traffic_sign') trafficSigns.push(s as unknown as TrafficSignShape)
    else if (s.type === 'crosswalk') crosswalks.push(s as unknown as CrosswalkShape)
    else if (s.type === 'polygon') {
      const poly = s as unknown as PolygonShape
      const vertices: { x: number; y: number }[] = []
      for (const pid of poly.props.pointIds) {
        const p = shapeMap.get(pid) as unknown as PointShape | undefined
        if (p) vertices.push({ x: p.x, y: p.y })
      }
      if (vertices.length >= 3) polygons.push({ shape: poly, vertices })
    }
  }

  // Carry-through: with an importer sidecar, unedited original roads are
  // re-emitted verbatim and excluded from regeneration.
  const carry = planCarryThrough(options.sidecar, shapeMap, trafficLights, trafficSigns, crosswalks)
  const regenLanes = carry ? lanes.filter(l => !carry.verbatimLaneIds.has(l.id)) : lanes
  const regenTrafficLights = carry
    ? trafficLights.filter(t => !carry.consumedShapeIds.has(t.id))
    : trafficLights
  const regenTrafficSigns = carry
    ? trafficSigns.filter(t => !carry.consumedShapeIds.has(t.id))
    : trafficSigns
  const regenCrosswalks = carry
    ? crosswalks.filter(c => !carry.consumedShapeIds.has(c.id))
    : crosswalks

  const dateStr = new Date().toISOString()
  const bbox = computeEnuBoundingBox(shapeMap)
  const geoRefProj = originToProjString(snapshot.origin)
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<OpenDRIVE>`)
  if (carry?.headerText) {
    // Carry-through keeps the original header (geoReference, bbox, vendor)
    // so an unedited round trip preserves the source coordinate frame.
    lines.push(carry.headerText)
  } else {
    // OpenDRIVE 1.8 expects <geoReference> inside <header>. We always emit one —
    // tmerc-at-origin when snapshot.origin is set, WGS84 longlat as a fallback —
    // so downstream tools (esmini, RoadRunner, asam-qc-opendrive) see a defined
    // coordinate reference system rather than nothing. The N/S/E/W attributes
    // are populated from the actual point cloud so the header bbox reflects the
    // map extent in ENU metres.
    lines.push(
      `  <header revMajor="1" revMinor="8" name="drawtonomy" version="1.0" date="${dateStr}" ` +
        `north="${fmt(bbox.north)}" south="${fmt(bbox.south)}" east="${fmt(bbox.east)}" west="${fmt(bbox.west)}" vendor="drawtonomy">`
    )
    lines.push(`    <geoReference><![CDATA[${escapeCdata(geoRefProj)}]]></geoReference>`)
    lines.push(`  </header>`)
  }

  const pointOverrides = buildBoundaryAlignmentOverrides(shapeMap, lanes)

  // Group laterally adjacent lanes into road bundles and build their
  // geometry. Degenerate bundles (zero-length reference lines) are dropped;
  // a multi-lane bundle whose geometry cannot be built (broken boundary
  // references) degrades to per-lane bundles so one bad lane does not drop
  // its neighbours.
  const exportBundles: ExportBundle[] = []
  for (const bundleLanes of detectBundles(regenLanes)) {
    const geom = buildBundleGeometry(shapeMap, bundleLanes, pointOverrides)
    if (geom && geom.length >= 0.01) {
      exportBundles.push({ lanes: bundleLanes, geom })
    } else if (bundleLanes.length > 1) {
      for (const lane of bundleLanes) {
        const g = buildBundleGeometry(shapeMap, [lane], pointOverrides)
        if (g && g.length >= 0.01) exportBundles.push({ lanes: [lane], geom: g })
      }
    }
  }

  // Stable road id assignment: bundles ordered by their first lane's position
  // in the snapshot. Lane ids count -1, -2, ... left→right within a bundle.
  // Carry-through: a regenerated bundle covering exactly the lane set of a
  // dirty original road keeps that road's id, so links inside verbatim
  // neighbours stay valid without rewriting; other bundles take fresh ids
  // above every original id.
  const laneOrder = new Map<string, number>()
  lanes.forEach((lane, i) => laneOrder.set(lane.id, i))
  exportBundles.sort(
    (a, b) => Math.min(...a.lanes.map(l => laneOrder.get(l.id)!)) - Math.min(...b.lanes.map(l => laneOrder.get(l.id)!))
  )
  const reuseKey = (ids: readonly string[]): string => [...ids].sort().join('\n')
  const reusableRoadIds = new Map<string, number>()
  if (carry) {
    for (const rid of carry.dirtyRecordedIds) {
      const rec = carry.records[rid]
      if (!rec || rec.laneShapeIds.length === 0 || !/^\d+$/.test(rid)) continue
      reusableRoadIds.set(reuseKey(rec.laneShapeIds), parseInt(rid, 10))
    }
  }
  const laneIdToRoadId = new Map<string, number>()
  const laneIdToOdrLaneId = new Map<string, number>()
  const roadIdByBundle = new Map<ExportBundle, number>()
  let nextRoadId = carry ? carry.idBase : 1
  for (const bundle of exportBundles) {
    const key = reuseKey(bundle.lanes.map(l => l.id))
    const reused = reusableRoadIds.get(key)
    if (reused !== undefined) reusableRoadIds.delete(key)
    const roadId = reused ?? nextRoadId++
    roadIdByBundle.set(bundle, roadId)
    bundle.lanes.forEach((lane, i) => {
      laneIdToRoadId.set(lane.id, roadId)
      laneIdToOdrLaneId.set(lane.id, -(i + 1))
    })
  }

  // Carry-through: lanes of verbatim roads join the connectivity id maps as
  // external endpoints, so regenerated roads link to / from them.
  const externalLanes = new Map<string, LaneShape>()
  if (carry) {
    for (const rid of carry.cleanRoadIds) {
      if (!/^\d+$/.test(rid)) continue
      for (const lid of carry.records[rid].laneShapeIds) {
        const shape = shapeMap.get(lid) as unknown as LaneShape | undefined
        if (!shape) continue
        const odrLaneId = parseInt(shape.props.attributes?.odr_lane_id ?? '', 10)
        if (!Number.isFinite(odrLaneId)) continue
        laneIdToRoadId.set(lid, parseInt(rid, 10))
        laneIdToOdrLaneId.set(lid, odrLaneId)
        externalLanes.set(lid, shape)
      }
    }
  }

  // Geometry seed for synthesized connecting roads: bundle lanes read it off
  // their fitted bundle geometry; external (verbatim) lanes off their drawn
  // boundary endpoints.
  const laneLocation = new Map<string, { bundle: ExportBundle; index: number }>()
  for (const bundle of exportBundles) {
    bundle.lanes.forEach((lane, index) => laneLocation.set(lane.id, { bundle, index }))
  }
  const connectingSourceFor = (laneShapeId: string): ConnectingSource | null => {
    const loc = laneLocation.get(laneShapeId)
    if (loc) {
      const geom = loc.bundle.geom
      const lastGeom = geom.planView[geom.planView.length - 1]
      const endPose = evalGeometry(lastGeom, lastGeom.length)
      // Lane boundaries sit toward -t (right of the reference direction): the
      // inner boundary of lane -(i+1) is offset by the widths of lanes 0..i-1.
      const lastIdx = geom.samplePoses.length - 1
      let offset = 0
      for (let m = 0; m < loc.index; m++) offset += geom.laneWidths[m][lastIdx]
      return {
        x: endPose.x + Math.sin(endPose.hdg) * offset,
        y: endPose.y - Math.cos(endPose.hdg) * offset,
        hdg: endPose.hdg,
        width: geom.laneWidths[loc.index][lastIdx],
        laneType: odrLaneTypeFor(loc.bundle.lanes[loc.index]),
      }
    }
    const lane = externalLanes.get(laneShapeId)
    if (!lane) return null
    const left = boundaryPointsOf(shapeMap, lane.props.leftBoundaryId, lane.props.invertLeft, NO_OVERRIDES)
    const right = boundaryPointsOf(shapeMap, lane.props.rightBoundaryId, lane.props.invertRight, NO_OVERRIDES)
    if (!left || !right) return null
    const ex = pxToEnuX(left[left.length - 1].x)
    const ey = pxToEnuY(left[left.length - 1].y)
    const px = pxToEnuX(left[left.length - 2].x)
    const py = pxToEnuY(left[left.length - 2].y)
    const rx = pxToEnuX(right[right.length - 1].x)
    const ry = pxToEnuY(right[right.length - 1].y)
    return {
      x: ex,
      y: ey,
      hdg: Math.atan2(ey - py, ex - px),
      width: Math.hypot(rx - ex, ry - ey),
      laneType: odrLaneTypeFor(lane),
    }
  }

  // Travel heading / width of a connecting road's target lane at its start,
  // for blending the stub onto the outgoing road (see ConnectingTarget).
  const connectingTargetFor = (laneShapeId: string): ConnectingTarget | null => {
    const loc = laneLocation.get(laneShapeId)
    if (loc) {
      const geom = loc.bundle.geom
      if (geom.samplePoses.length === 0) return null
      const pose = geom.samplePoses[0]
      // Lane boundaries sit toward -t (right of the reference direction).
      let offset = 0
      for (let m = 0; m < loc.index; m++) offset += geom.laneWidths[m][0]
      return {
        x: pose.x + Math.sin(pose.hdg) * offset,
        y: pose.y - Math.cos(pose.hdg) * offset,
        hdg: pose.hdg,
        width: geom.laneWidths[loc.index][0],
      }
    }
    const lane = externalLanes.get(laneShapeId)
    if (!lane) return null
    const left = boundaryPointsOf(shapeMap, lane.props.leftBoundaryId, lane.props.invertLeft, NO_OVERRIDES)
    const right = boundaryPointsOf(shapeMap, lane.props.rightBoundaryId, lane.props.invertRight, NO_OVERRIDES)
    if (!left || !right || left.length < 2 || right.length < 1) return null
    const ax = pxToEnuX(left[0].x)
    const ay = pxToEnuY(left[0].y)
    const bx = pxToEnuX(left[1].x)
    const by = pxToEnuY(left[1].y)
    const rx = pxToEnuX(right[0].x)
    const ry = pxToEnuY(right[0].y)
    return {
      x: ax,
      y: ay,
      hdg: Math.atan2(by - ay, bx - ax),
      width: Math.hypot(rx - ax, ry - ay),
    }
  }

  // Full lane width at a linked contact, for the zero-width link rules:
  // bundle lanes read their fitted width samples, external (verbatim) lanes
  // measure their drawn boundary endpoints.
  const contactWidth = (laneShapeId: string, contact: 'start' | 'end'): number | null => {
    const loc = laneLocation.get(laneShapeId)
    if (loc) {
      const widths = loc.bundle.geom.laneWidths[loc.index]
      if (!widths || widths.length === 0) return null
      return contact === 'start' ? widths[0] : widths[widths.length - 1]
    }
    const lane = externalLanes.get(laneShapeId)
    if (!lane) return null
    const left = boundaryPointsOf(shapeMap, lane.props.leftBoundaryId, lane.props.invertLeft, NO_OVERRIDES)
    const right = boundaryPointsOf(shapeMap, lane.props.rightBoundaryId, lane.props.invertRight, NO_OVERRIDES)
    if (!left || !right || left.length === 0 || right.length === 0) return null
    const li = contact === 'start' ? left[0] : left[left.length - 1]
    const ri = contact === 'start' ? right[0] : right[right.length - 1]
    return pxToMeter(Math.hypot(ri.x - li.x, ri.y - li.y))
  }

  const plan = planConnectivity(
    exportBundles,
    laneIdToRoadId,
    laneIdToOdrLaneId,
    nextRoadId,
    connectingSourceFor,
    connectingTargetFor,
    contactWidth,
    externalLanes
  )
  const roads = exportBundles.map(b => ({ roadId: roadIdByBundle.get(b)!, geom: b.geom }))
  const { roadSignals, roadObjects, roadSignalRefs, signalIdByShape } = attachShapesToRoads(
    shapeMap,
    regenTrafficLights,
    regenTrafficSigns,
    regenCrosswalks,
    polygons,
    roads,
    laneIdToRoadId,
    laneIdToOdrLaneId,
    undefined,
    carry?.signalIdBase
  )

  // Verbatim road blocks first (original document order). Two minimal
  // rewrites keep their links valid; nothing else is touched:
  // - road links to a dirty road whose lanes regenerated into exactly one
  //   bundle under a different id are re-pointed at that bundle;
  // - junction links to a dirty (regenerated) junction are re-pointed at the
  //   synthesized junction this road participates in (junction-routed pairs
  //   sharing a road always merge, so the target is unique per road).
  if (carry) {
    const rewriteMap = new Map<string, string>()
    const bundleRoadOfLane = new Map<string, number>()
    for (const bundle of exportBundles) {
      const rid = roadIdByBundle.get(bundle)!
      for (const l of bundle.lanes) bundleRoadOfLane.set(l.id, rid)
    }
    for (const rid of carry.dirtyRecordedIds) {
      const rec = carry.records[rid]
      if (!rec) continue
      const newIds = new Set<number>()
      for (const lid of rec.laneShapeIds) {
        const nid = bundleRoadOfLane.get(lid)
        if (nid !== undefined) newIds.add(nid)
      }
      if (newIds.size === 1) {
        const nid = String([...newIds][0])
        if (nid !== rid) rewriteMap.set(rid, nid)
      }
    }
    const newJunctionOfRoad = new Map<number, number>()
    for (const spec of plan.connectingRoads) {
      newJunctionOfRoad.set(spec.incomingRoadId, spec.junctionId)
      newJunctionOfRoad.set(spec.outgoingRoadId, spec.junctionId)
    }
    for (const r of carry.verbatimRoads) {
      let junctionMap: Map<string, string> | undefined
      for (const jref of r.linkJunctionRefs) {
        if (!carry.dirtyJunctionIds.has(jref)) continue
        const exportedId = /^\d+$/.test(r.id) ? parseInt(r.id, 10) : NaN
        const replacement = newJunctionOfRoad.get(exportedId)
        if (replacement !== undefined) {
          junctionMap = junctionMap ?? new Map()
          junctionMap.set(jref, String(replacement))
        }
      }
      lines.push(rewriteRoadLinkTargets(r.text, rewriteMap, junctionMap ?? new Map()))
    }
  }

  for (const bundle of exportBundles) {
    const roadId = roadIdByBundle.get(bundle)!
    lines.push(
      emitRoad(
        bundle,
        roadId,
        plan,
        roadSignals.get(roadId) ?? [],
        roadSignalRefs.get(roadId) ?? [],
        roadObjects.get(roadId) ?? [],
        shapeMap,
        laneIdToRoadId,
        laneIdToOdrLaneId
      )
    )
  }

  // Synthesized junction connecting roads (standard incoming -> connecting ->
  // outgoing structure; see planConnectivity).
  for (const spec of plan.connectingRoads) {
    lines.push(emitConnectingRoad(spec))
  }

  // Verbatim controllers (every controlled signal lives in a verbatim road).
  if (carry) {
    for (const text of carry.verbatimControllerTexts) lines.push(text)
  }

  // Signal groups: traffic lights sharing a controllerId (one intersection)
  // become a <controller> listing their emitted signals as <control> records.
  const controllerGroups = new Map<string, number[]>()
  for (const tl of regenTrafficLights) {
    const groupId = tl.props.controllerId
    if (!groupId) continue
    const signalId = signalIdByShape.get(tl.id)
    if (signalId === undefined) continue
    const group = controllerGroups.get(groupId) ?? []
    group.push(signalId)
    controllerGroups.set(groupId, group)
  }
  let controllerIdCounter = carry ? carry.controllerIdBase : 1
  for (const [groupId, signalIds] of controllerGroups) {
    lines.push(`  <controller id="${controllerIdCounter++}" name="${escapeXml(groupId)}" sequence="0">`)
    for (const signalId of signalIds) {
      lines.push(`    <control signalId="${signalId}" type="0"/>`)
    }
    lines.push(`  </controller>`)
  }

  // Verbatim junctions (all member roads verbatim).
  if (carry) {
    for (const text of carry.verbatimJunctionTexts) lines.push(text)
  }

  // Synthesized junctions for branch / merge connectivity (see planConnectivity).
  for (const junction of plan.junctions) {
    lines.push(`  <junction id="${junction.id}" name="junction${junction.id}">`)
    junction.connections.forEach((conn, idx) => {
      lines.push(
        `    <connection id="${idx}" incomingRoad="${conn.incoming}" connectingRoad="${conn.connecting}" contactPoint="start">`
      )
      for (const ll of conn.laneLinks) {
        lines.push(`      <laneLink from="${ll.from}" to="${ll.to}"/>`)
      }
      lines.push(`    </connection>`)
    })
    for (const pr of junction.priorities) {
      lines.push(`    <priority high="${pr.high}" low="${pr.low}"/>`)
    }
    lines.push(`  </junction>`)
  }

  lines.push(`</OpenDRIVE>`)
  return lines.join('\n')
}

/**
 * Compute the axis-aligned bounding box of all point shapes in ENU metres.
 * Used to populate OpenDRIVE <header> north/south/east/west attributes.
 * Returns zeros when the snapshot has no points.
 */
function computeEnuBoundingBox(shapeMap: Map<string, BaseShape>): {
  north: number
  south: number
  east: number
  west: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of shapeMap.values()) {
    if (s.type !== 'point') continue
    if (s.x < minX) minX = s.x
    if (s.x > maxX) maxX = s.x
    if (s.y < minY) minY = s.y
    if (s.y > maxY) maxY = s.y
  }
  if (!Number.isFinite(minX)) {
    return { north: 0, south: 0, east: 0, west: 0 }
  }
  // Canvas y points down, ENU y points up — flip when reporting bounds.
  return {
    west: pxToEnuX(minX),
    east: pxToEnuX(maxX),
    south: pxToEnuY(maxY),
    north: pxToEnuY(minY),
  }
}

/**
 * Escape a string so it can appear safely inside an XML CDATA section. The
 * only character sequence that ends a CDATA section is `]]>`, so we split it
 * across two CDATA sections.
 */
function escapeCdata(s: string): string {
  return s.replace(/]]>/g, ']]]]><![CDATA[>')
}
