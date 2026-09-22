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
} from '../types.js'
import { sampleAtParam, type Point2D } from './laneCenterline.js'
import { evalGeometry } from './odrGeometry.js'
import { fitPlanView, type FittedSamplePose } from './odrGeometryFit.js'
import {
  fitElevationProfile,
  resolveElevationGaps,
  type ElevationSample,
  type GapSample,
} from './odrElevationFit.js'
import { parseOpenDriveXml, type OdrGeometry, type OdrRoad } from './opendriveParser.js'
import {
  buildSurgicalRoad,
  laneShapeKey,
  rewriteSignals,
  type LaneShapeKey,
  type SurgicalSignalShape,
} from './odrSurgical.js'
import { originToProjString } from './projection.js'
import { escapeXml, fmt, fmtPrecise, pxToEnuX, pxToEnuY, pxToMeter } from './units.js'
import {
  appendControlRecords,
  dropControlRecords,
  rewriteSignalReferences,
  extractOdrDocument,
  hashRoadLaneSemantics,
  hashRoadNonSignalRegulatory,
  hashRoadSemantics,
  hashRoadState,
  isSignalKind,
  rewriteJunctionControllerRefs,
  rewriteRoadLinkTargets,
  serializeSignalPayload,
  type CarryLaneState,
  type CarryRegulatoryState,
  type OdrDocJunction,
  type OdrDocRoad,
  type OdrDocument,
  type OdrRoadRecord,
  type SignalBaseline,
} from './odrCarryThrough.js'
import type { OdrSidecar } from './odrToShapes.js'
import { trafficSignCode } from './lanelet2.js'

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
   * boundary's own vertices, covering the whole road. Empty when the drawn
   * points carry no height, or when what they carry does not describe the
   * whole road (see `resolveElevationGaps`), in which case the road emits
   * `<elevationProfile/>` as before.
   */
  elevationSamples: ElevationSample[]
}

/** A road bundle: laterally adjacent lanes emitted as one <road>. */
interface ExportBundle {
  /**
   * Lanes ordered left→right in travel direction; index i ⇒ ODR lane -(i+1),
   * or +(i+1) when `leftSide` (index counts inner→outer on the left side).
   */
  lanes: LaneShape[]
  geom: BundleGeometry
  /**
   * True when every lane came from the `<left>` side of an imported road
   * (positive `odr_lane_id`). Such lanes travel opposite to the original
   * reference line; keeping them on the left side preserves the original
   * lane-id signs and reference-line direction (s does not flip) across the
   * round trip.
   */
  leftSide: boolean
}

/**
 * Imported left-side lanes carry a positive `odr_lane_id` and are stored with
 * `invertLeft` / `invertRight` set (their boundaries are kept in original
 * reference-line order and reversed into travel order on read). Only when the
 * whole bundle is such lanes can the road be emitted on the `<left>` side
 * with the reference line kept in its original direction.
 */
function isLeftSideBundle(lanes: LaneShape[]): boolean {
  return lanes.every(l => {
    const id = parseInt(l.props.attributes?.odr_lane_id ?? '', 10)
    return (
      Number.isFinite(id) && id > 0 && l.props.invertLeft === true && l.props.invertRight === true
    )
  })
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

function normalOffsets(
  poses: readonly FittedSamplePose[],
  bnd: readonly Point2D[],
  fallbackSign: 1 | -1 = 1
): number[] {
  const out: number[] = []
  let prev: number | null = null
  for (const pose of poses) {
    // Right normal of heading h in ENU: (sin h, -cos h).
    const nx = Math.sin(pose.hdg)
    const ny = -Math.cos(pose.hdg)
    // The closest-point distance is unsigned; `fallbackSign` orients it to
    // the side the bundle's boundaries actually lie on (-1 for left-side
    // bundles, whose true offsets are negative along the right normal —
    // otherwise the first station's reference value would sit a full road
    // width away from every intersection and discard them all).
    const fallback = fallbackSign * distancePointToPolyline({ x: pose.x, y: pose.y }, bnd)
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
  pointOverrides: Map<string, Point2D>,
  leftSide: boolean = false
): BundleGeometry | null {
  const first = bundleLanes[0]
  const boundaries: BoundaryPoint[][] = []
  // Left-side bundles keep their boundaries in original reference-line order
  // (not reversed into travel order): the reference line must run in the
  // original s direction so the round trip preserves it, with the lanes
  // emitted on the <left> side (offsets toward +t).
  const left = boundaryPointsOf(
    shapeMap,
    first.props.leftBoundaryId,
    leftSide ? false : first.props.invertLeft,
    pointOverrides
  )
  if (!left) return null
  boundaries.push(left)
  for (const lane of bundleLanes) {
    const right = boundaryPointsOf(
      shapeMap,
      lane.props.rightBoundaryId,
      leftSide ? false : lane.props.invertRight,
      pointOverrides
    )
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

  const offsets = bndOdr.map(b => normalOffsets(samplePoses, b, leftSide ? -1 : 1))
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
  // Widths grow toward -t (right) for right-side bundles and toward +t
  // (left) for left-side bundles; `normalOffsets` measures toward -t.
  const laneWidths = bundleLanes.map((_, i) =>
    samplePoses.map((_, j) =>
      Math.max(0, leftSide ? offsets[i][j] - offsets[i + 1][j] : offsets[i + 1][j] - offsets[i][j])
    )
  )

  // Elevation samples: the reference boundary's own vertices already have a
  // fitted station (fit.samplePoses is index-aligned with `ref`), so the
  // height rides along without resampling. Boundaries other than the
  // reference share the station's height (no superelevation support yet), so
  // taking the reference boundary alone is exact for imported roads.
  //
  // A vertex can be missing z for reasons unrelated to elevation data (a
  // point shared with another linestring, a boundary aligner weld, a
  // hand-drawn extension of an imported road). `resolveElevationGaps`
  // decides whether the remaining annotation still describes the road: a
  // short hole is reconstructed by station-space interpolation, an
  // unannotated end stub is held at the nearest known height, and anything
  // longer rejects the profile rather than let the fitter run a cubic
  // through stations it has no data for.
  const gapSamples: GapSample[] = []
  for (let i = 0; i < ref.length && i < fit.samplePoses.length; i++) {
    gapSamples.push({ s: fit.samplePoses[i].s, z: boundaries[0][i]?.z })
  }
  const elevationSamples = resolveElevationGaps(gapSamples, fit.length) ?? []

  return {
    planView: fit.geometries,
    samplePoses,
    laneWidths,
    length: fit.length,
    elevationSamples,
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

/**
 * The primitive element for one fitted `<geometry>`.
 *
 * Exhaustive on purpose: an unhandled kind used to fall through to `<line/>`,
 * which silently straightens the road instead of failing, so every primitive
 * gets its own branch and the default throws.
 */
function emitGeometryPrimitive(g: OdrGeometry): string {
  switch (g.kind) {
    case 'line':
      return `        <line/>`
    case 'arc':
      return `        <arc curvature="${fmtPrecise(g.curvature)}"/>`
    case 'spiral':
      return `        <spiral curvStart="${fmtPrecise(g.curvStart)}" curvEnd="${fmtPrecise(g.curvEnd)}"/>`
    case 'paramPoly3':
      return (
        `        <paramPoly3 aU="${fmtPrecise(g.aU)}" bU="${fmtPrecise(g.bU)}" cU="${fmtPrecise(g.cU)}" dU="${fmtPrecise(g.dU)}" ` +
        `aV="${fmtPrecise(g.aV)}" bV="${fmtPrecise(g.bV)}" cV="${fmtPrecise(g.cV)}" dV="${fmtPrecise(g.dV)}" pRange="arcLength"/>`
      )
    case 'poly3':
      // Deprecated in OpenDRIVE 1.6 and never produced by the fitter; it can
      // only arrive from a carried-through import, where the record is
      // re-emitted verbatim rather than through this path.
      return `        <poly3 a="${fmtPrecise(g.a)}" b="${fmtPrecise(g.b)}" c="${fmtPrecise(g.c)}" d="${fmtPrecise(g.d)}"/>`
  }
}

function emitPlanView(geom: BundleGeometry): string {
  const lines: string[] = []
  lines.push(`    <planView>`)
  for (const g of geom.planView) {
    if (g.length < 1e-9) continue
    lines.push(
      `      <geometry s="${fmt(g.s)}" x="${fmt(g.x)}" y="${fmt(g.y)}" hdg="${fmt(g.hdg)}" length="${fmt(g.length)}">`
    )
    lines.push(emitGeometryPrimitive(g))
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
  // The plan view follows the bundle's innermost boundary, so lane 0 (center)
  // lies on that edge and no laneOffset is required. Right-side bundles emit
  // -1, -2, ... outward (left→right in travel direction); left-side bundles
  // emit +1, +2, ... outward on the <left> side (their travel direction runs
  // against the reference line), each lane spanning its full drawn width.
  const emitOneLane = (lane: LaneShape, i: number): void => {
    const odrId = bundle.leftSide ? i + 1 : -(i + 1)
    lines.push(`          <lane id="${odrId}" type="${odrLaneTypeFor(lane)}" level="false">`)
    emitLaneLink(lines, plan.lanePredecessor.get(lane.id), plan.laneSuccessor.get(lane.id))
    emitWidthEntries(geom, i, lines)
    lines.push(`            ${roadMarkElementFor(shapeMap, lane.props.rightBoundaryId)}`)
    lines.push(`          </lane>`)
  }
  lines.push(`      <laneSection s="0">`)
  if (bundle.leftSide) {
    // Left lanes are conventionally listed outermost first (descending id).
    lines.push(`        <left>`)
    for (let i = bundle.lanes.length - 1; i >= 0; i--) emitOneLane(bundle.lanes[i], i)
    lines.push(`        </left>`)
  }
  lines.push(`        <center>`)
  lines.push(`          <lane id="0" type="none" level="false">`)
  lines.push(`            <link/>`)
  lines.push(`            ${roadMarkElementFor(shapeMap, bundle.lanes[0].props.leftBoundaryId)}`)
  lines.push(`          </lane>`)
  lines.push(`        </center>`)
  if (!bundle.leftSide) {
    lines.push(`        <right>`)
    bundle.lanes.forEach(emitOneLane)
    lines.push(`        </right>`)
  }
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

type RoadLinkTarget = {
  kind: 'road' | 'junction'
  id: number
  /**
   * Contact point on the linked road (road links only). Defaults to the
   * classic convention (predecessor@end / successor@start); a left-side
   * linked road flips it because its travel entry/exit sits on the opposite
   * geometric end.
   */
  contactPoint?: 'start' | 'end'
}

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
  /**
   * Contact point on the incoming road (travel exit): 'end' for right-side
   * source lanes, 'start' for left-side ones.
   */
  incomingContact: 'start' | 'end'
  /**
   * Contact point on the outgoing road (travel entry): 'start' for
   * right-side target lanes, 'end' for left-side ones.
   */
  outgoingContact: 'start' | 'end'
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
    connections: {
      incoming: number
      connecting: number
      laneLinks: { from: number; to: number }[]
      /**
       * End of the connecting road the incoming road meets. Synthesized
       * connecting roads are always built from their start; only a carried
       * connection whose source said "end" sets this.
       */
      contactPoint?: 'start' | 'end'
    }[]
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
  externalLanes: Map<string, LaneShape> = new Map(),
  /**
   * Lane shape ids on the roads a carried <junction> wires up, mapped to that
   * junction's id, with the lanes of its CONNECTING roads listed separately.
   * An edge inside one such group that has a connecting road at one end is
   * written down in the carried XML already; synthesizing a stub for it would
   * emit the intersection twice.
   */
  carriedJunction: {
    ofLane: Map<string, string>
    onConnectingRoad: Set<string>
  } = { ofLane: new Map(), onConnectingRoad: new Set() }
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
  /**
   * Road -> carried junction it contacts, from the edges skipped below. The
   * edge is not rebuilt, but the road still has to say it runs into that
   * junction, exactly as the source did.
   */
  const carriedJunctionLink: { roadId: number; junctionId: number; atStart: boolean }[] = []
  /**
   * Both ends of each regenerated connecting road of a carried junction.
   * The <connection> table only records the incoming -> connecting edge, so
   * skipping these lane edges wholesale left the connecting road itself with
   * an empty <link>: the source said predecessor road 0 and successor road 1,
   * and the export said nothing. These are applied after the synthesized
   * junctions are planned, so a real edge always wins the slot.
   */
  const carriedConnectingLink: {
    connectingRoad: number
    connectingLane: string
    otherRoad: number
    otherLane: string
  }[] = []
  for (const [laneId, nexts] of validNext) {
    const fromRoad = roadIdOf.get(laneId)!
    for (const to of nexts) {
      if (externalLanes.has(laneId) && externalLanes.has(to)) continue
      const toRoad = roadIdOf.get(to)!
      // The contact is already written down in a carried <junction> and in
      // the two roads' own <link> records; building it again here would emit
      // a second intersection on top of the first.
      const carriedFrom = carriedJunction.ofLane.get(laneId)
      if (
        carriedFrom !== undefined &&
        carriedFrom === carriedJunction.ofLane.get(to) &&
        (carriedJunction.onConnectingRoad.has(laneId) ||
          carriedJunction.onConnectingRoad.has(to))
      ) {
        const junctionId = parseInt(carriedFrom, 10)
        if (Number.isFinite(junctionId)) {
          // The road that is NOT the connecting one links to the junction.
          // A travel edge leaves a right-side lane at its road's end and a
          // left-side lane at its road's start, so the slot follows the sign
          // of the lane id, as everywhere else here.
          if (!carriedJunction.onConnectingRoad.has(laneId)) {
            carriedJunctionLink.push({
              roadId: fromRoad,
              junctionId,
              atStart: (odrIdOf.get(laneId) ?? -1) > 0,
            })
          } else {
            carriedConnectingLink.push({
              connectingRoad: fromRoad,
              connectingLane: laneId,
              otherRoad: toRoad,
              otherLane: to,
            })
          }
          if (!carriedJunction.onConnectingRoad.has(to)) {
            carriedJunctionLink.push({
              roadId: toRoad,
              junctionId,
              atStart: (odrIdOf.get(to) ?? -1) < 0,
            })
          } else {
            carriedConnectingLink.push({
              connectingRoad: toRoad,
              connectingLane: to,
              otherRoad: fromRoad,
              otherLane: laneId,
            })
          }
        }
        continue
      }
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
      // Lane / road links are ODR-semantic (predecessor = the road's s=0
      // contact). A travel edge exits a right-side lane at its road's end
      // but a left-side lane (positive ODR id, travel against s) at its
      // road's start, so the slot and the linked contact point both follow
      // the lane-id signs.
      const fromLeft = (odrIdOf.get(laneEdges[0].from) ?? -1) > 0
      const toLeft = (odrIdOf.get(laneEdges[0].to) ?? -1) > 0
      ;(fromLeft ? plan.roadPredecessor : plan.roadSuccessor).set(fromRoad, {
        kind: 'road',
        id: toRoad,
        contactPoint: toLeft ? 'end' : 'start',
      })
      ;(toLeft ? plan.roadSuccessor : plan.roadPredecessor).set(toRoad, {
        kind: 'road',
        id: fromRoad,
        contactPoint: fromLeft ? 'start' : 'end',
      })
      for (const e of laneEdges) {
        const eFromLeft = (odrIdOf.get(e.from) ?? -1) > 0
        const eToLeft = (odrIdOf.get(e.to) ?? -1) > 0
        ;(eFromLeft ? plan.lanePredecessor : plan.laneSuccessor).set(e.from, odrIdOf.get(e.to)!)
        ;(eToLeft ? plan.laneSuccessor : plan.lanePredecessor).set(e.to, odrIdOf.get(e.from)!)
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
        incomingContact: odrIdOf.get(e.from)! > 0 ? 'start' : 'end',
        outgoingContact: odrIdOf.get(e.to)! > 0 ? 'end' : 'start',
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
    // The junction sits at the travel exit of the incoming road and the
    // travel entry of the outgoing road; for left-side roads those are the
    // geometric start / end respectively (see the road-link case above).
    const incomingLeft = (odrIdOf.get(pair.laneEdges[0].from) ?? -1) > 0
    const outgoingLeft = (odrIdOf.get(pair.laneEdges[0].to) ?? -1) > 0
    ;(incomingLeft ? plan.roadPredecessor : plan.roadSuccessor).set(pair.incoming, {
      kind: 'junction',
      id: junction.id,
    })
    ;(outgoingLeft ? plan.roadSuccessor : plan.roadPredecessor).set(pair.outgoing, {
      kind: 'junction',
      id: junction.id,
    })
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

  // A road contacting a carried junction says so in its own <link>, the way
  // the source did. The edge itself was left to the carried XML, so nothing
  // above claimed this slot — and if something did, that link is a real one
  // and wins.
  for (const { roadId, junctionId, atStart } of carriedJunctionLink) {
    const slot = atStart ? plan.roadPredecessor : plan.roadSuccessor
    if (!slot.has(roadId)) slot.set(roadId, { kind: 'junction', id: junctionId })
  }

  // A regenerated connecting road of a carried junction links to the roads
  // at both of its ends, the way the source did. The <connection> table only
  // records the incoming edge, so without this the road came out inside the
  // junction with an empty <link> and nothing to traverse. As above, a slot
  // a real edge already claimed is left alone.
  for (const { connectingRoad, connectingLane, otherRoad, otherLane } of carriedConnectingLink) {
    // A travel edge leaves a right-side lane at its road's end and a
    // left-side lane at its road's start, so both the slot and the contact
    // point on the other road follow the lane-id signs — same rule as the
    // ordinary road-to-road case above.
    const ownId = odrIdOf.get(connectingLane) ?? -1
    const otherId = odrIdOf.get(otherLane) ?? -1
    const ownLeft = ownId > 0
    const otherLeft = otherId > 0
    // `connectingLane -> otherLane` is a travel edge when the connecting
    // lane lists it as a next; the reverse pair is pushed separately.
    const outgoing = (validNext.get(connectingLane) ?? []).includes(otherLane)
    const slot = outgoing === ownLeft ? plan.roadPredecessor : plan.roadSuccessor
    if (!slot.has(connectingRoad)) {
      slot.set(connectingRoad, {
        kind: 'road',
        id: otherRoad,
        contactPoint: outgoing === otherLeft ? 'end' : 'start',
      })
    }
    const laneSlot = outgoing === ownLeft ? plan.lanePredecessor : plan.laneSuccessor
    if (!laneSlot.has(connectingLane)) laneSlot.set(connectingLane, otherId)
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
    `      <predecessor elementType="road" elementId="${spec.incomingRoadId}" contactPoint="${spec.incomingContact}"/>`
  )
  lines.push(
    `      <successor elementType="road" elementId="${spec.outgoingRoadId}" contactPoint="${spec.outgoingContact}"/>`
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
        : `      <predecessor elementType="road" elementId="${pred.id}" contactPoint="${pred.contactPoint ?? 'end'}"/>`
    )
  }
  const succ = plan.roadSuccessor.get(roadId)
  if (succ) {
    lines.push(
      succ.kind === 'junction'
        ? `      <successor elementType="junction" elementId="${succ.id}"/>`
        : `      <successor elementType="road" elementId="${succ.id}" contactPoint="${succ.contactPoint ?? 'start'}"/>`
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

/**
 * Build the `<signal>` record for one traffic light / sign shape at a station
 * already projected onto its road. Shared by the full-regeneration exporter and
 * the surgical `<signal>` rewrite, so a signal added to an otherwise verbatim
 * road is emitted with exactly the same attribute set as a regenerated one.
 */
function buildSignalEntry(
  kind: 'traffic_light' | 'traffic_sign',
  shape: TrafficLightShape | TrafficSignShape,
  id: number,
  s: number,
  t: number
): SignalEntry {
  const heightM = pxToMeter(shape.props.h)
  const widthM = pxToMeter(shape.props.w)
  const orientation: '+' | '-' = t >= 0 ? '+' : '-'
  if (kind === 'traffic_light') {
    const style = (shape.props as TrafficLightProps).style ?? ''
    const isPed = style.startsWith('pedestrian') || style.includes('ped')
    // Conventional signal type codes: 1000001 = vehicle, 1000002 = pedestrian.
    return {
      id,
      s,
      t,
      zOffset: isPed ? 1.5 : 4.5,
      height: heightM,
      width: widthM,
      name: style,
      type: isPed ? '1000002' : '1000001',
      subtype: '-1',
      dynamic: 'yes',
      orientation,
    }
  }
  // Static traffic sign: reuse the exact OpenDRIVE type / subtype / country
  // recorded at import time; fresh signs fall back to type "-1" with the sign
  // code as the name. Full attribute round-trip rides on
  // <userData code="signAttributes">.
  const attrs = (shape.props.attributes ?? {}) as Record<string, string | undefined>
  const entry: SignalEntry = {
    id,
    s,
    t,
    zOffset: 2,
    height: heightM,
    width: widthM,
    name: trafficSignCode(attrs),
    type: attrs.odr_signal_type || '-1',
    subtype: attrs.odr_signal_subtype || '-1',
    country: attrs.odr_country || undefined,
    dynamic: 'no',
    orientation,
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
  return entry
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

    const list = roadSignals.get(best.roadId) ?? []
    const entry = buildSignalEntry(kind, tl, signalIdCounter++, best.proj.s, best.proj.t)
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

/** One `<signal>` element, indented from `indent` (children one step deeper). */
function emitSignalElement(s: SignalEntry, indent: string): string {
  const attrs = `id="${s.id}" s="${fmt(s.s)}" t="${fmt(s.t)}" zOffset="${fmt(s.zOffset)}" name="${escapeXml(s.name)}" dynamic="${s.dynamic}" orientation="${s.orientation}" type="${s.type}" subtype="${s.subtype}" country="${escapeXml(s.country ?? 'OpenDRIVE')}" value="0" height="${fmt(s.height)}" width="${fmt(s.width)}"`
  if (!(s.validity?.length || s.stopLinePoints || s.userData?.length)) {
    return `${indent}<signal ${attrs}/>`
  }
  const inner = `${indent}  `
  const lines: string[] = [`${indent}<signal ${attrs}>`]
  for (const v of s.validity ?? []) {
    lines.push(`${inner}<validity fromLane="${v.fromLane}" toLane="${v.toLane}"/>`)
  }
  if (s.stopLinePoints) {
    const json = JSON.stringify(s.stopLinePoints.map(p => [roundMm(p.x), roundMm(p.y)]))
    lines.push(`${inner}<userData code="stopLine" value="${escapeXml(json)}"/>`)
  }
  for (const ud of s.userData ?? []) {
    lines.push(`${inner}<userData code="${escapeXml(ud.code)}" value="${escapeXml(ud.value)}"/>`)
  }
  lines.push(`${indent}</signal>`)
  return lines.join('\n')
}

function emitSignals(signals: SignalEntry[], references: SignalReferenceEntry[]): string {
  if (!signals.length && !references.length) return `    <signals/>`
  const lines: string[] = []
  lines.push(`    <signals>`)
  for (const s of signals) lines.push(emitSignalElement(s, '      '))
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
function emitLaneAttributesUserData(bundleLanes: LaneShape[], leftSide: boolean): string | null {
  const byLane: Record<string, Record<string, string>> = {}
  bundleLanes.forEach((lane, i) => {
    const stash: Record<string, string> = {}
    for (const [k, v] of Object.entries(lane.props.attributes ?? {})) {
      if (k === 'type' || k.startsWith('odr_')) continue
      if (v === undefined || v === null || v === '') continue
      stash[k] = String(v)
    }
    if (Object.keys(stash).length > 0) byLane[String(leftSide ? i + 1 : -(i + 1))] = stash
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
      byLane[String(laneIdToOdrLaneId.get(lane.id) ?? -(i + 1))] = targets
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
  laneIdToOdrLaneId: Map<string, number>,
  /**
   * Junction this road belongs to, when it is one whose <junction> element
   * survived the edit verbatim. The carried <connection> table names the road
   * by id, so it has to come back stamped with that junction.
   */
  junctionId?: string
): string {
  const first = bundle.lanes[0]
  const speed = bundle.lanes.find(l => l.props.attributes?.speed_limit)?.props.attributes?.speed_limit
  // Prefer the source road's name (carried on import) so regenerated roads
  // stay recognizable to tools matching on name; fall back to the subtype.
  const name = escapeXml(
    first.props.attributes?.odr_road_name || first.props.attributes?.subtype || 'road'
  )
  const lines: string[] = []
  // A regenerated road belongs to a junction only when the original
  // <junction> element survived this export: the carried <connection> table
  // still names this road by id, so the attribute points at something real.
  // When the junction had to be rebuilt instead, membership is carried by the
  // synthesized connecting roads (emitConnectingRoad) and this road is
  // emitted as a mainline.
  lines.push(
    `  <road name="${name}" length="${fmt(emittedRoadLength(bundle.geom))}" id="${roadId}" junction="${junctionId ?? '-1'}">`
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
  const userData = emitLaneAttributesUserData(bundle.lanes, bundle.leftSide)
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

/**
 * One end of a carried road's <link>, with the lanes of the neighbour that
 * its lanes name across that end.
 *
 * Used to re-point a reference into a road that split: the road gives its id
 * to one side, and a member reaching the other side is emitted pointing at
 * the road that took those lanes instead.
 */
interface MemberEnd {
  /** The member road making the reference. */
  from: string
  /** Which of the member's own <link> slots holds it. */
  end: 'predecessor' | 'successor'
  /** The road id the source named. */
  to: string
  /** Which end of `to` the reference meets, from its contactPoint. */
  toAt: 'start' | 'end'
  /** Lane ids of `to` that the member's lanes name across this end. */
  laneIds: Set<number>
}

/**
 * The lane shape recorded for road `rid` whose ODR lane id is `laneId`, at
 * the `atEnd` end of the road.
 *
 * A multi-<laneSection> road becomes one lane shape per section, all sharing
 * the same lane id, so the end decides which one a reference means.
 */
function laneShapeWithOdrIdOnRoad(
  carry: CarryPlan,
  shapeMap: Map<string, BaseShape>,
  rid: string,
  laneId: number,
  atEnd: 'start' | 'end' = 'start'
): string | undefined {
  let best: { id: string; s: number } | undefined
  for (const lid of carry.records[rid]?.laneShapeIds ?? []) {
    const shape = shapeMap.get(lid)
    if (!shape || shape.type !== 'lane') continue
    const attrs = (shape as unknown as LaneShape).props.attributes
    if (parseInt(attrs?.odr_lane_id ?? '', 10) !== laneId) continue
    const s = parseFloat(attrs?.odr_section_s ?? '0')
    const sectionS = Number.isFinite(s) ? s : 0
    if (!best || (atEnd === 'start' ? sectionS < best.s : sectionS > best.s)) {
      best = { id: lid, s: sectionS }
    }
  }
  return best?.id
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
  /**
   * Surgically regenerated roads (edit was lateral-only): the original <road>
   * text with only its lane <width> records rewritten, keyed by road id.
   * These roads are treated as clean (kept verbatim except for the widths),
   * so their lanes are excluded from full regeneration.
   */
  surgicalRoadText: Map<string, string>
  /** Original junction ids that must be regenerated (members changed). */
  dirtyJunctionIds: Set<string>
  /**
   * Junctions whose <connection> table still resolves, so the element is
   * re-emitted as written and its members may regenerate independently.
   * A junction outside this set keeps the old all-or-nothing rule.
   */
  carriedJunctionIds: Set<string>
  verbatimJunctionTexts: string[]
  /**
   * Original junction id per REGENERATED road that belonged to one, for roads
   * whose junction is carried verbatim. The road keeps the id the carried
   * <connection> table names it by, so it is re-emitted with its junction
   * attribute instead of being demoted to a mainline.
   */
  junctionOfRegeneratedRoad: Map<string, string>
  /**
   * Original road id -> the carried junction that already wires it up: its
   * connecting roads plus every road they link to. Connectivity planning
   * drops the lane edges inside such a group so it does not synthesize a
   * second intersection on top of the carried one.
   */
  carriedJunctionOfRoad: Map<string, string>
  /** Of those, the ones that are the junction's CONNECTING roads. */
  carriedJunctionConnectingRoadIds: Set<string>
  /**
   * Per original road id, the lane shapes whose ODR lane id a carried
   * <connection> names. A road that splits into two bundles must give its id
   * to the bundle holding these, or the carried table stops resolving.
   */
  junctionLaneShapeIds: Map<string, Set<string>>
  /**
   * References from a carried junction's members into the half of a split
   * road that lost the road id. The member's own text is re-pointed at the
   * road that took those lanes when it is emitted.
   */
  splitRetargets: MemberEnd[]
  /**
   * Signal ids the carried (verbatim / surgical) text still defines. What a
   * reference in that text has to be measured against, once the regeneration
   * path's ids are known too.
   */
  carriedSignalIds: Set<string>
  /** Surviving controllers, keyed by original id so regenerated signals of the same group can merge in. */
  verbatimControllers: { id: string; text: string }[]
  /** First id for regenerated roads / junctions (above every original id). */
  idBase: number
  signalIdBase: number
  controllerIdBase: number
  /**
   * Emitted `<signal id>` per shape id for signals kept or added by the
   * surgical `<signal>` rewrite. Their roads are verbatim, so the regeneration
   * path never sees these shapes — `<controller>` grouping reads them here.
   */
  surgicalSignalIdByShape: Map<string, string>
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
 * Roads referencing an unrecorded ROAD (e.g. a selective import) are never
 * carried verbatim, so verbatim output cannot dangle into missing roads. A
 * road referencing a JUNCTION id that has no matching <junction> element is
 * different: that reference was already dangling in the source document, so
 * carrying the road verbatim (dangling ref intact) creates no new loss.
 */
function planCarryThrough(
  sidecar: OdrSidecar | null | undefined,
  shapeMap: Map<string, BaseShape>,
  trafficLights: TrafficLightShape[],
  trafficSigns: TrafficSignShape[],
  crosswalks: CrosswalkShape[],
  /**
   * Junction ids a previous planning round found unusable once the bundles
   * were actually built (see the re-plan loop in exportToOpenDrive). Seeding
   * them as rebuildable here lets the SAME fixpoint that classifies every
   * other junction take them into account, so the plan it settles on is
   * internally consistent — the alternative, patching a settled plan from the
   * emit side, left roads stamped with a junction the output no longer had.
   */
  forcedRebuildableJunctionIds: ReadonlySet<string> = new Set()
): CarryPlan | null {
  const records = sidecar?.roadRecords
  if (!sidecar || !records || Object.keys(records).length === 0) return null
  const doc = extractOdrDocument(sidecar.rawXml)
  if (!doc) return null
  const docRoadById = new Map(doc.roads.map(r => [r.id, r]))
  const docJunctionById = new Map(doc.junctions.map(j => [j.id, j]))

  // Parsed original roads, for surgical (lateral-only) width recomputation.
  // Parsing failures leave `parsedRoadById` empty, disabling the surgical
  // path and falling back to full regeneration for every edited road.
  const parsedRoadById = new Map<string, OdrRoad>()
  try {
    for (const r of parseOpenDriveXml(sidecar.rawXml).roads) parsedRoadById.set(r.id, r)
  } catch {
    // ignore; surgical simply stays unavailable
  }

  // laneShapeId -> recorded road id (over every record).
  const laneRoadOf = new Map<string, string>()
  for (const [rid, rec] of Object.entries(records)) {
    for (const lid of rec.laneShapeIds) laneRoadOf.set(lid, rid)
  }

  /**
   * ODR lane ids of the affected lanes that live on `roadId`, for the
   * `<validity>` of a signal added to an otherwise verbatim road. Returns an
   * empty list when none do (the signal then applies to the whole road).
   */
  const affectedOdrLaneIdsOnRoad = (
    affectedLaneIds: readonly string[] | undefined,
    roadId: string
  ): number[] => {
    const out: number[] = []
    for (const lid of affectedLaneIds ?? []) {
      if (laneRoadOf.get(lid) !== roadId) continue
      const lane = shapeMap.get(lid)
      if (!lane || lane.type !== 'lane') continue
      const odrLaneId = parseInt(
        (lane as unknown as LaneShape).props.attributes?.odr_lane_id ?? '',
        10
      )
      if (Number.isFinite(odrLaneId) && !out.includes(odrLaneId)) out.push(odrLaneId)
    }
    return out
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
  /**
   * Live `<signal>` shapes per road that will hold their definition, for the
   * surgical `<signal>` rewrite.
   *
   * An imported signal belongs to the road it came from (`odr_road_id`). A
   * signal the user drew has no such attribute, so its road is derived from
   * the lanes it applies to: when every affected lane lives on one recorded
   * road, that road defines it. (Roads that merely *reference* a signal keep a
   * `<signalReference>` and never hold the definition, so they are not
   * listed.) A shape whose road cannot be settled this way is left out, and
   * the shape-accounting below keeps it out of `consumedShapeIds` so the
   * regeneration path still emits it.
   */
  const signalShapesByRoad = new Map<string, SurgicalSignalShape[]>()
  /** Road each signal shape is to be defined on, when one could be settled. */
  const signalDefiningRoad = new Map<string, string>()
  /**
   * Signal shapes the user drew whose defining road could not be settled,
   * because the lanes they apply to live on more than one recorded road.
   *
   * Nothing in the carried text defines such a signal, and the surgical
   * rewrite cannot place it either (it rewrites one road's element and would
   * have to pick one). Only the regeneration path can emit it, and that path
   * only sees shapes the carry did not consume — so these must not be
   * consumed, and the roads they could belong to have to regenerate.
   */
  const unplaceableSignalShapeIds = new Set<string>()
  const addRegState = (
    state: CarryRegulatoryState,
    affected: readonly string[],
    own: string | undefined
  ): void => {
    const touching = new Set<string>()
    if (own && records[own]) touching.add(own)
    const affectedRoads = new Set<string>()
    for (const lid of affected) {
      const rid = laneRoadOf.get(lid)
      if (rid) {
        touching.add(rid)
        affectedRoads.add(rid)
      }
    }
    for (const rid of touching) {
      const list = regStatesByRoad.get(rid) ?? []
      list.push(state)
      regStatesByRoad.set(rid, list)
    }
    regShapes.push({ shapeId: state.shapeId, touching })
    if (!isSignalKind(state.kind)) return
    const definingRoad =
      own && records[own]
        ? own
        : // New shape: only an unambiguous single affected road can hold it.
          !own && affectedRoads.size === 1
          ? [...affectedRoads][0]
          : undefined
    if (definingRoad === undefined) {
      if (!own) unplaceableSignalShapeIds.add(state.shapeId)
      return
    }
    signalDefiningRoad.set(state.shapeId, definingRoad)
    const list = signalShapesByRoad.get(definingRoad) ?? []
    list.push({
      shapeId: state.shapeId,
      odrSignalId: state.attributes['odr_signal_id'] ?? '',
      canvasX: state.numbers[0],
      canvasY: state.numbers[1],
      x: pxToEnuX(state.numbers[0]),
      y: pxToEnuY(state.numbers[1]),
      payload: serializeSignalPayload(state),
    })
    signalShapesByRoad.set(definingRoad, list)
  }
  /** The live shape behind a signal-kind regulatory state, for re-emission. */
  const signalShapeById = new Map<string, { kind: 'traffic_light' | 'traffic_sign'; shape: TrafficLightShape | TrafficSignShape }>()
  for (const tl of trafficLights) {
    signalShapeById.set(tl.id, { kind: 'traffic_light', shape: tl })
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
    signalShapeById.set(ts.id, { kind: 'traffic_sign', shape: ts })
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

  // Live lane shapes of a recorded road keyed by (odr_lane_id, odr_section_s),
  // for surgical width recomputation. Null when any recorded lane shape is
  // missing or lacks the odr identifiers.
  const laneShapesByKey = (rec: OdrRoadRecord): Map<LaneShapeKey, LaneShape> | null => {
    const map = new Map<LaneShapeKey, LaneShape>()
    for (const lid of rec.laneShapeIds) {
      const shape = shapeMap.get(lid)
      if (!shape || shape.type !== 'lane') return null
      const lane = shape as unknown as LaneShape
      const odrLaneId = parseInt(lane.props.attributes?.odr_lane_id ?? '', 10)
      const sectionS = parseFloat(lane.props.attributes?.odr_section_s ?? '')
      if (!Number.isFinite(odrLaneId) || !Number.isFinite(sectionS)) return null
      map.set(laneShapeKey(odrLaneId, sectionS), lane)
    }
    return map
  }

  // Seed dirtiness: hash mismatch, missing shapes, or references that leave
  // the recorded set. An edited road whose edit is purely lateral (and / or
  // confined to its signals) is rewritten surgically and stays clean.
  const dirty = new Set<string>()
  const surgicalRoadText = new Map<string, string>()
  /** Shapes whose signal survived surgically, so the regen path must skip them. */
  const surgicalSignalShapeIds = new Set<string>()
  /**
   * Emitted `<signal id>` per shape id for surgically rewritten signals.
   *
   * Kept as the string the output really carries. A source id need not be a
   * decimal number — `light500` and `0500` are both legal — and rounding it
   * through `number` does not come back: the comparison against the source
   * ids then misses, and the group emits a `<control signalId="NaN">` or one
   * naming a signal that does not exist.
   */
  const surgicalSignalIdByShape = new Map<string, string>()
  // Fresh ids for signals added to an otherwise verbatim road are taken from
  // the same space the regeneration path uses, so the two cannot collide.
  let nextSurgicalSignalId = Math.max(doc.maxNumericSignalId, 0) + 1
  /**
   * Move / drop / add the `<signal>` elements of `roadText` to match the live
   * shapes, and record the ids they came out under. Null when the rewrite
   * cannot express the change (a signal pushed off the road, one that grew a
   * stop line), which the caller answers according to what it can fall back
   * to.
   */
  const rewriteRoadSignalsSurgically = (
    rid: string,
    parsed: OdrRoad,
    roadText: string,
    baselines: Readonly<Record<string, SignalBaseline>>
  ): string | null => {
    const result = rewriteSignals(
      roadText,
      parsed,
      signalShapesByRoad.get(rid) ?? [],
      baselines,
      nextSurgicalSignalId,
      (shapeId, id, s, t, indent) => {
        const live = signalShapeById.get(shapeId)
        if (!live) return null
        const entry = buildSignalEntry(live.kind, live.shape, parseInt(id, 10), s, t)
        const affected = affectedOdrLaneIdsOnRoad(live.shape.props.affectedLaneIds, rid)
        if (affected.length > 0) entry.validity = laneIdRanges(affected)
        // A stop line is emitted as a separate <object>, which this rewrite
        // does not touch; a signal that carries one must go through full
        // regeneration instead.
        if (live.shape.props.stopLineId) return null
        return emitSignalElement(entry, indent)
      }
    )
    if (result === null) return null
    nextSurgicalSignalId += result.allocatedIds
    for (const [shapeId, id] of result.signalIdByShape) {
      surgicalSignalShapeIds.add(shapeId)
      surgicalSignalIdByShape.set(shapeId, id)
    }
    return result.text
  }
  for (const [rid, rec] of Object.entries(records)) {
    const docRoad = docRoadById.get(rid)
    if (!docRoad) {
      dirty.add(rid)
      continue
    }
    if (docRoad.linkRoadRefs.some(ref => !records[ref])) {
      dirty.add(rid)
      continue
    }
    // A junction link naming an id with no matching <junction> element is
    // already dangling in the source document (bad authoring, or a
    // deliberately partial import) — it cannot regenerate into something
    // valid, so it stays exactly as dangling in the output. Forcing the road
    // (and by propagation its real junction, if it shares members with one)
    // to regenerate over a reference that was never resolvable only adds
    // blast radius without fixing anything.
    const laneStates = exportLaneStates(rec)
    const regStates = regStatesByRoad.get(rid) ?? []
    if (!laneStates || hashRoadState(laneStates, regStates) !== rec.stateHash) {
      // The road changed. Two edits are expressible as a byte-local rewrite of
      // the original <road> element, and they compose:
      //
      //  - boundary points moved only laterally  -> rewrite the lane <width>s
      //  - a signal moved / added / deleted      -> rewrite the <signal>s
      //
      // Both require the lane semantics (attributes, connectivity,
      // right-of-way) to be untouched, and the signal rewrite additionally
      // requires the non-<signal> regulatory shapes (crosswalks, emitted as
      // <object>s) to be untouched. Anything else — edited attributes, a
      // longitudinal drag, a lane added or removed, a crosswalk moved — fails
      // the check and the road regenerates fully.
      const laneSemanticsUnchanged =
        laneStates != null &&
        rec.laneSemanticHash !== undefined &&
        hashRoadLaneSemantics(laneStates) === rec.laneSemanticHash
      // Legacy records (no laneSemanticHash) keep the original precondition.
      const semanticUnchanged =
        laneStates != null &&
        rec.semanticHash !== undefined &&
        hashRoadSemantics(laneStates, regStates) === rec.semanticHash
      const signalsMayHaveMoved =
        laneSemanticsUnchanged &&
        !semanticUnchanged &&
        rec.nonSignalRegulatoryHash !== undefined &&
        hashRoadNonSignalRegulatory(regStates) === rec.nonSignalRegulatoryHash

      // Lane geometry that did not move needs no width rewrite at all: the
      // <lanes> subtree stays byte-verbatim (rewriting it would reformat every
      // <width> record for nothing).
      const laneGeometryUnchanged =
        laneStates != null && hashRoadState(laneStates, []) === rec.laneGeometryHash

      const parsed =
        semanticUnchanged || signalsMayHaveMoved ? parsedRoadById.get(rid) : undefined
      const laneShapes = parsed && !laneGeometryUnchanged ? laneShapesByKey(rec) : null
      let surgical: string | null = null
      if (parsed && laneGeometryUnchanged) surgical = docRoad.text
      else if (parsed && laneShapes) {
        surgical = buildSurgicalRoad(parsed, docRoad.text, laneShapes, shapeMap)
      }

      if (surgical !== null && signalsMayHaveMoved) {
        // The widths (if any changed) are in; now move / drop / add the
        // <signal> elements on top of the same text.
        surgical = rewriteRoadSignalsSurgically(
          rid,
          parsed!,
          surgical,
          rec.signalBaselines ?? {}
        )
      }
      if (surgical !== null) surgicalRoadText.set(rid, surgical)
      else dirty.add(rid)
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

  /**
   * The lane shape on `rid` that a <connection> means by ODR lane id `laneId`,
   * or null when the emitted road will not have that lane id.
   *
   * A <connection> names lanes by number, and the exporter does not keep the
   * source's numbers: it renumbers a regenerated bundle from +/-1 outward. So
   * for a road that regenerates, the number a carried table uses is only
   * still right if the lane at that position comes back at that position.
   * Lanes the importer dropped (a type it does not model) shift every lane
   * outside them, which is exactly the case that used to slip through.
   *
   * For a road staying verbatim the emitted numbers are the source's by
   * construction, so the source number is the answer.
   */
  const laneNamedBy = (rid: string, laneId: number, atEnd?: 'start' | 'end'): string | null => {
    const rec = records[rid]
    if (!rec) return null
    const live: { shapeId: string; odrLaneId: number; sectionS: number }[] = []
    for (const lid of rec.laneShapeIds) {
      const shape = shapeMap.get(lid)
      if (!shape || shape.type !== 'lane') return null
      const attrs = (shape as unknown as LaneShape).props.attributes
      const odrLaneId = parseInt(attrs?.odr_lane_id ?? '', 10)
      if (!Number.isFinite(odrLaneId)) return null
      // A multi-<laneSection> road becomes one lane shape per section, so a
      // reference to "lane 1 of road 27" means lane 1 of the section at the
      // end the reference reaches, not the first one that matches.
      const sectionS = parseFloat(attrs?.odr_section_s ?? '0')
      live.push({ shapeId: lid, odrLaneId, sectionS: Number.isFinite(sectionS) ? sectionS : 0 })
    }
    const candidates = live.filter(l => l.odrLaneId === laneId)
    if (candidates.length === 0) return null
    const match =
      candidates.length === 1
        ? candidates[0]
        : atEnd === undefined
          ? null
          : [...candidates].sort((a, b) =>
              atEnd === 'start' ? a.sectionS - b.sectionS : b.sectionS - a.sectionS
            )[0]
    // Ambiguous: several sections offer this lane id and the caller did not
    // say which end it means. Refusing to guess keeps the carry conservative.
    if (!match) return null
    if (dirty.has(rid)) {
      // Regeneration renumbers each side from 1 outward, in the source's
      // order. The carried number survives only when the lane's rank on its
      // side within its own section still equals |laneId|.
      const sameSide = live
        .filter(l => Math.sign(l.odrLaneId) === Math.sign(laneId) && l.sectionS === match.sectionS)
        .sort((a, b) => Math.abs(a.odrLaneId) - Math.abs(b.odrLaneId))
      const rank = sameSide.findIndex(l => l.shapeId === match.shapeId) + 1
      if (rank !== Math.abs(laneId)) return null
    }
    return match.shapeId
  }

  /** Does `laneId` still list `otherId` among its next / prev? */
  const stillConnected = (laneId: string, otherId: string): boolean => {
    const shape = shapeMap.get(laneId)
    if (!shape || shape.type !== 'lane') return false
    const props = (shape as unknown as LaneShape).props
    return (props.next ?? []).includes(otherId) || (props.prev ?? []).includes(otherId)
  }

  /** ODR lane ids of the live lane shapes recorded for `rid`. */
  const liveOdrLaneIds = (rid: string): Set<number> | null => {
    const rec = records[rid]
    if (!rec) return null
    const ids = new Set<number>()
    for (const lid of rec.laneShapeIds) {
      const shape = shapeMap.get(lid)
      if (!shape || shape.type !== 'lane') return null
      const odrLaneId = parseInt(
        (shape as unknown as LaneShape).props.attributes?.odr_lane_id ?? '',
        10
      )
      if (!Number.isFinite(odrLaneId)) return null
      ids.add(odrLaneId)
    }
    return ids
  }

  /**
   * Which side of `rid` a regenerating road keeps its id on, or 0 when it
   * does not split.
   *
   * A regenerated road is one bundle per side: lanes with a positive ODR id
   * run against s and are emitted as a separate <road> from the negative
   * ones, and only one of the two can inherit the source's id. The side the
   * junction's <connection> table names gets first claim (see the id
   * assignment in the exporter), so `claimed` decides it; with no claim the
   * road is not one this junction relies on and either side will do.
   */
  const splitSideKeepingRoadId = (rid: string, claimed: number): number => {
    if (!dirty.has(rid)) return 0
    const ids = liveOdrLaneIds(rid)
    if (!ids) return 0
    let positive = false
    let negative = false
    for (const id of ids) {
      if (id > 0) positive = true
      else if (id < 0) negative = true
    }
    if (!positive || !negative) return 0
    return claimed !== 0 ? claimed : 1
  }

  /**
   * Does a reference to lane `laneId` of `rid` still resolve on the road
   * that keeps `rid`'s id?
   *
   * For a road staying verbatim the answer is always yes: its element text
   * is re-emitted byte for byte, lanes the importer does not model (a type
   * it has no shape for) included. Only a regenerating road can lose a lane
   * — by renumbering it, or by handing it to the other half of a split.
   */
  const laneStaysOnRoad = (
    rid: string,
    laneId: number,
    splitSide: number,
    atEnd: 'start' | 'end'
  ): boolean => {
    if (!dirty.has(rid)) return true
    if (splitSide !== 0 && Math.sign(laneId) !== splitSide) return false
    return laneNamedBy(rid, laneId, atEnd) !== null
  }

  /**
   * Every (road, lane) a member of `j` names, from the member's own <link>
   * as well as from its lanes.
   *
   * The <connection> table only records the incoming -> connecting edge. The
   * connecting road's OTHER end — where it meets the outgoing road — lives in
   * the connecting road's own <link>, and carrying the junction carries that
   * text too. Both ends have to hold, or a neighbour ends up pointing at a
   * lane that moved to a different road.
   *
   * Reported per (member, end) so a member pointing into the side of a split
   * road that lost the id can be re-pointed at the road that took its lanes,
   * rather than the whole junction being given up.
   *
   * A split puts one side on a fresh road, renumbered from 1 outward exactly
   * as it was on the original (the ranks within a side do not change when
   * the other side leaves), so the numbers hold and the new road is
   * unambiguous as long as the whole reference moved together.
   */
  const splitSideIsRetargetable = (
    rid: string,
    laneIds: Iterable<number>,
    splitSide: number,
    atEnd: 'start' | 'end'
  ): boolean => {
    if (!records[rid] || !dirty.has(rid) || splitSide === 0) return false
    let any = false
    for (const laneId of laneIds) {
      // Lanes on the side that kept the id are not moving.
      if (Math.sign(laneId) === splitSide) continue
      if (laneNamedBy(rid, laneId, atEnd) === null) return false
      any = true
    }
    return any
  }

  const memberLinkEnds = (j: OdrDocJunction): MemberEnd[] | null => {
    const out: MemberEnd[] = []
    for (const m of j.memberRoadIds) {
      const docRoad = docRoadById.get(m)
      if (!docRoad) return null
      const linkText = docRoad.text.match(/<link>[\s\S]*?<\/link>/)?.[0] ?? ''
      const tagOf = (end: string): string | undefined =>
        linkText.match(new RegExp(`<${end}\\s+elementType="road"[^>]*/?>`))?.[0]
      const ends: Record<string, string | undefined> = {
        predecessor: tagOf('predecessor')?.match(/\belementId="(\d+)"/)?.[1],
        successor: tagOf('successor')?.match(/\belementId="(\d+)"/)?.[1],
      }
      const contactOf = (end: string): 'start' | 'end' =>
        (tagOf(end)?.match(/\bcontactPoint="([^"]*)"/)?.[1] as 'start' | 'end' | undefined) ??
        (end === 'predecessor' ? 'end' : 'start')
      // Only the outermost <laneSection>s reach the neighbours: a lane's
      // <predecessor> in the FIRST section names a lane of the road at the
      // road's own predecessor, and its <successor> in the LAST section a
      // lane of the road at the successor. In between, the same tags name
      // lanes of the next section of this very road, which is nobody else's
      // business — reading them as neighbour references made a four-section
      // connecting road look like it pointed at two roads at once.
      const sections = docRoad.text.match(/<laneSection\b[\s\S]*?<\/laneSection>/g) ?? [
        docRoad.text,
      ]
      const sectionFor = (end: string): string =>
        end === 'predecessor' ? sections[0] : sections[sections.length - 1]
      const byEnd = new Map<string, Set<number>>()
      for (const end of ['predecessor', 'successor']) {
        if (ends[end] === undefined) continue
        for (const laneM of sectionFor(end).matchAll(
          /<lane\b[^>]*?\bid="(-?\d+)"(?:[^>]*?\/>|[^>]*?>[\s\S]*?<\/lane>)/g
        )) {
          if (parseInt(laneM[1], 10) === 0) continue
          for (const l of laneM[0].matchAll(
            new RegExp(`<${end}\\s+id="(-?\\d+)"\\s*/>`, 'g')
          )) {
            const set = byEnd.get(end) ?? new Set<number>()
            set.add(parseInt(l[1], 10))
            byEnd.set(end, set)
          }
        }
      }
      for (const [end, laneIds] of byEnd) {
        out.push({
          from: m,
          end: end as MemberEnd['end'],
          to: ends[end]!,
          toAt: contactOf(end),
          laneIds,
        })
      }
    }
    return out
  }

  /**
   * Can this junction's <connection> table survive as written?
   *
   * The table names roads by id and lanes by id, and says which lane runs
   * into which. Carrying it verbatim asserts all three are still true, so
   * all three are checked here:
   *
   * - the road exists and was recorded, so there is something to regenerate
   *   it from;
   * - the lane the table names comes back under that number (`laneNamedBy`);
   * - the two lanes are still connected in the live graph. A user who cut a
   *   connection left the lanes in place, and a rule that only looked at
   *   lane existence handed their deleted connection straight back;
   * - every lane the carried text points at — including the far end of each
   *   connecting road, which the table does not mention — is still on the
   *   road that names it (`lanesKeepingRoadId`).
   *
   * Moving an interior point does not break any of these: a <connection>
   * says which lane continues into which, not where they are. Changing an
   * endpoint, a connection or a lane's road does.
   */
  const connectionTableSurvives = (j: OdrDocJunction): MemberEnd[] | null => {
    const fail = null
    const splitRetargets: MemberEnd[] = []
    // A <junction type="direct"> has no connecting roads — its <connection>
    // records name a linkedRoad instead — so there is nothing here to keep
    // out of regeneration. It keeps the old all-or-nothing treatment.
    if (/\btype="direct"/.test(j.text)) return fail
    for (const m of j.memberRoadIds) {
      if (!records[m] || !docRoadById.has(m)) return fail
    }
    // The side of each road the junction claims, so a split road's id goes
    // where the table needs it (mirrors the id assignment in the exporter).
    const claimedSide = new Map<string, number>()
    for (const conn of j.text.match(/<connection\b[^>]*?(?:\/>|>[\s\S]*?<\/connection>)/g) ?? []) {
      const incoming = conn.match(/\bincomingRoad="([^"]*)"/)?.[1]
      const connecting = conn.match(/\bconnectingRoad="([^"]*)"/)?.[1]
      if (incoming === undefined || connecting === undefined) return fail
      // The connecting road is met at `contactPoint`; the incoming road is
      // met at the end its own <link> gives to this junction.
      const connectingAt =
        (conn.match(/\bcontactPoint="([^"]*)"/)?.[1] as 'start' | 'end' | undefined) ?? 'start'
      const incomingText = docRoadById.get(incoming)?.text ?? ''
      const incomingAt: 'start' | 'end' = new RegExp(
        `<predecessor\\s+elementType="junction"\\s+elementId="${j.id}"`
      ).test(incomingText)
        ? 'start'
        : 'end'
      const links = conn.match(/<laneLink\b[^>]*>/g) ?? []
      if (links.length === 0) return fail
      for (const link of links) {
        const from = parseInt(link.match(/\bfrom="([^"]*)"/)?.[1] ?? '', 10)
        const to = parseInt(link.match(/\bto="([^"]*)"/)?.[1] ?? '', 10)
        if (!Number.isFinite(from) || !Number.isFinite(to)) return fail
        const fromShape = laneNamedBy(incoming, from, incomingAt)
        const toShape = laneNamedBy(connecting, to, connectingAt)
        if (fromShape === null || toShape === null) return fail
        if (!stillConnected(fromShape, toShape) && !stillConnected(toShape, fromShape)) return fail
        for (const [rid, laneId] of [
          [incoming, from],
          [connecting, to],
        ] as const) {
          const side = Math.sign(laneId)
          const seen = claimedSide.get(rid)
          if (seen !== undefined && seen !== side) return fail
          claimedSide.set(rid, side)
        }
      }
    }
    // Both ends of every member road have to keep resolving, not just the
    // incoming edge the table writes down.
    const ends = memberLinkEnds(j)
    if (!ends) return fail
    for (const { from, end, to, toAt, laneIds } of ends) {
      // A road outside the records is not something this export regenerates,
      // so its lanes are whatever the source said.
      if (!records[to]) {
        if (dirty.has(to)) return fail
        continue
      }
      const splitSide = splitSideKeepingRoadId(to, claimedSide.get(to) ?? 0)
      let missing = false
      for (const laneId of laneIds) {
        if (laneStaysOnRoad(to, laneId, splitSide, toAt)) continue
        // A lane the emitted road simply does not have any more (renumbered,
        // or deleted) is not something a road reference can be re-pointed
        // around.
        if (splitSide === 0 || Math.sign(laneId) === splitSide) return fail
        missing = true
      }
      if (!missing) continue
      // `to` split and this end reaches the half that lost the id. One road
      // reference serves all of the member's lanes, so it can only follow
      // the lanes when they ALL moved — a reference straddling both halves
      // has no single road to point at.
      for (const laneId of laneIds) if (Math.sign(laneId) === splitSide) return fail
      if (!splitSideIsRetargetable(to, laneIds, splitSide, toAt)) return fail
      splitRetargets.push({ from, end, to, toAt, laneIds: new Set(laneIds) })
    }
    return splitRetargets
  }

  // Junctions whose table survives are carried verbatim, so their member
  // roads may regenerate without dragging each other in. Only a junction
  // whose table has to be rebuilt still propagates dirtiness to its
  // connecting roads — the rebuild replaces their <connection> records, so
  // they have to be re-emitted under the synthesized structure.
  // Classification and propagation are ONE fixpoint. `connectionTableSurvives`
  // reads the dirty set (a road that regenerates renumbers its lanes and may
  // split in two), and demoting a junction to "rebuildable" dirties its
  // connecting roads, which can in turn demote the next junction. Deciding
  // once up front and propagating afterwards left roads stamped with a
  // junction that the later pass had stopped emitting.
  //
  // The loop only ever adds to `dirty` and only ever moves a junction from
  // carried to rebuildable, so it terminates.
  const rebuildable = new Set<string>(forcedRebuildableJunctionIds)
  const dirtyJunctionIds = new Set<string>()
  /**
   * References from carried members into the half of a split road that lost
   * the road id, to be re-pointed when those members are emitted. Recomputed
   * on every pass, because a road going dirty changes which ones there are.
   */
  let splitRetargets: MemberEnd[] = []
  let changed = true
  while (changed) {
    changed = false
    splitRetargets = []
    for (const j of doc.junctions) {
      if (!rebuildable.has(j.id)) {
        const retargets = connectionTableSurvives(j)
        if (retargets === null) {
          rebuildable.add(j.id)
          changed = true
        } else {
          splitRetargets.push(...retargets)
        }
      }
      if (!rebuildable.has(j.id)) continue
      // A junction that has to be rebuilt drags only its connecting
      // (junction-stamped) roads into regeneration — clean incoming /
      // outgoing roads keep their verbatim text, with the junction link id
      // rewritten on emission.
      let bad = false
      for (const m of members.get(j.id)!) {
        if (!records[m] || dirty.has(m)) {
          bad = true
          break
        }
      }
      if (!bad) continue
      if (!dirtyJunctionIds.has(j.id)) {
        dirtyJunctionIds.add(j.id)
        changed = true
      }
      for (const m of junctionStamped.get(j.id) ?? []) {
        if (records[m] && !dirty.has(m)) {
          dirty.add(m)
          changed = true
        }
      }
    }
    for (const reg of regShapes) {
      // A signal the user drew across lanes of several roads has no road that
      // can define it in carried text. The regeneration path is the only one
      // that can emit it, so the roads it applies to go there — the same
      // treatment a regulatory shape gets when one of its roads is dirty.
      let bad = unplaceableSignalShapeIds.has(reg.shapeId)
      if (!bad) {
        for (const rid of reg.touching) {
          if (dirty.has(rid)) {
            bad = true
            break
          }
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
  const carriedJunctionIds = new Set(
    doc.junctions.filter(j => !rebuildable.has(j.id)).map(j => j.id)
  )

  const cleanRoadIds = new Set<string>()
  for (const rid of Object.keys(records)) {
    if (!dirty.has(rid) && docRoadById.has(rid)) cleanRoadIds.add(rid)
  }

  const verbatimLaneIds = new Set<string>()
  for (const rid of cleanRoadIds) {
    for (const lid of records[rid].laneShapeIds) verbatimLaneIds.add(lid)
  }

  // A road that was rewritten surgically and then dragged into regeneration by
  // the fixpoint above emits nothing of that rewrite: its text is thrown away
  // and its signals come back out of the regeneration path under different
  // ids. The provisional ids are not in the output, so they must not survive
  // into <controller> grouping or into the consumed-shape accounting.
  for (const [shapeId, rid] of signalDefiningRoad) {
    if (!cleanRoadIds.has(rid)) surgicalSignalIdByShape.delete(shapeId)
  }

  // A regulatory shape is "consumed" only when the verbatim / surgical output
  // really carries it. Every road it touches being clean is necessary but not
  // sufficient: a signal shape must additionally have been emitted by the
  // surgical rewrite. Marking one consumed without that would drop it from the
  // regeneration path too, and it would appear in no output at all.
  const consumedShapeIds = new Set<string>()
  for (const reg of regShapes) {
    if (reg.touching.size === 0) continue
    // No carried road defines this one (its lanes span several), so nothing
    // in the verbatim / surgical output carries it whatever its roads did.
    if (unplaceableSignalShapeIds.has(reg.shapeId)) continue
    let allClean = true
    for (const rid of reg.touching) {
      if (!cleanRoadIds.has(rid)) {
        allClean = false
        break
      }
    }
    if (!allClean) continue
    // Signal-kind shapes on a surgically rewritten road are covered only if
    // that rewrite gave them an id; on an untouched road they are covered by
    // the verbatim text.
    const definingRoad = signalDefiningRoad.get(reg.shapeId)
    if (
      definingRoad !== undefined &&
      surgicalRoadText.has(definingRoad) &&
      !surgicalSignalIdByShape.has(reg.shapeId)
    ) {
      continue
    }
    consumedShapeIds.add(reg.shapeId)
  }

  const verbatimRoads: OdrDocRoad[] = []
  for (const r of doc.roads) {
    if (cleanRoadIds.has(r.id)) verbatimRoads.push(r)
  }

  // A carried junction keeps naming its connecting roads by id, so a
  // regenerated one must come back stamped with that junction rather than as
  // a mainline — otherwise the <connection> points at a road that no longer
  // claims membership. The same table already expresses the incoming ->
  // connecting edges, so connectivity planning must not build them again.
  const junctionOfRegeneratedRoad = new Map<string, string>()
  const carriedJunctionOfRoad = new Map<string, string>()
  const carriedJunctionConnectingRoadIds = new Set<string>()
  const junctionLaneShapeIds = new Map<string, Set<string>>()
  /** The lane shape of `rid` whose ODR lane id is `laneId`, if any. */
  const laneShapeWithOdrId = (rid: string, laneId: number): string | undefined => {
    for (const lid of records[rid]?.laneShapeIds ?? []) {
      const shape = shapeMap.get(lid)
      if (!shape || shape.type !== 'lane') continue
      const odrLaneId = parseInt(
        (shape as unknown as LaneShape).props.attributes?.odr_lane_id ?? '',
        10
      )
      if (odrLaneId === laneId) return lid
    }
    return undefined
  }
  for (const j of doc.junctions) {
    if (!carriedJunctionIds.has(j.id) || dirtyJunctionIds.has(j.id)) continue
    for (const conn of j.text.match(/<connection\b[^>]*?(?:\/>|>[\s\S]*?<\/connection>)/g) ?? []) {
      const incoming = conn.match(/\bincomingRoad="([^"]*)"/)?.[1] ?? ''
      const connecting = conn.match(/\bconnectingRoad="([^"]*)"/)?.[1] ?? ''
      for (const link of conn.match(/<laneLink\b[^>]*>/g) ?? []) {
        const from = parseInt(link.match(/\bfrom="([^"]*)"/)?.[1] ?? '', 10)
        const to = parseInt(link.match(/\bto="([^"]*)"/)?.[1] ?? '', 10)
        for (const [rid, laneId] of [
          [incoming, from],
          [connecting, to],
        ] as const) {
          const lid = laneShapeWithOdrId(rid, laneId)
          if (lid === undefined) continue
          const set = junctionLaneShapeIds.get(rid) ?? new Set<string>()
          set.add(lid)
          junctionLaneShapeIds.set(rid, set)
        }
      }
    }
    // A connecting road meets the incoming road at one end and the outgoing
    // road at the other. The <connection> names only the first pair; the
    // second is on the connecting road's own <link>. Both contacts are
    // written down in the carried XML.
    for (const m of junctionStamped.get(j.id) ?? []) {
      if (dirty.has(m)) junctionOfRegeneratedRoad.set(m, j.id)
      carriedJunctionOfRoad.set(m, j.id)
      carriedJunctionConnectingRoadIds.add(m)
      for (const ref of docRoadById.get(m)?.linkRoadRefs ?? []) {
        carriedJunctionOfRoad.set(ref, j.id)
      }
    }
  }

  // Signal ids the carried-through output actually still defines. A road kept
  // verbatim defines everything it did at import; a road rewritten surgically
  // defines what its rewritten text says, which is fewer signals when one was
  // deleted and more when one was added. Anything referring to a signal id
  // (<control>, <signalReference>) has to be measured against THIS set, not
  // against "was the defining road clean" — a surgical road is clean and can
  // still have dropped the signal.
  const carriedSignalIds = new Set<string>()
  for (const r of verbatimRoads) {
    const surgical = surgicalRoadText.get(r.id)
    if (surgical === undefined) {
      for (const sid of r.signalIds) carriedSignalIds.add(sid)
      continue
    }
    for (const tag of surgical.match(/<signal\b[^>]*>/g) ?? []) {
      const sid = tag.match(/\bid="([^"]*)"/)?.[1]
      if (sid !== undefined) carriedSignalIds.add(sid)
    }
  }

  // A <signalReference> in carried text can only be resolved once the
  // regeneration path has run and its ids are known: a signal whose road was
  // edited is not in `carriedSignalIds`, but it is not gone either — it comes
  // back under a fresh id, and the reference should follow it rather than be
  // deleted. Pruning here, before that, threw away live references (a
  // reference on a road with no lane shapes has no shape to re-emit it, so
  // nothing replaced it). The decision is made in exportToOpenDrive instead;
  // `carriedSignalIds` is what it starts from.

  const verbatimJunctionTexts: string[] = []
  for (const j of doc.junctions) {
    if (!dirtyJunctionIds.has(j.id)) verbatimJunctionTexts.push(j.text)
  }

  // Controllers are kept whenever at least one controlled signal survives in
  // the carried output. <control> records naming signals that regenerated
  // (their road was edited, so the signal is re-emitted under a fresh id) or
  // that were deleted outright are dropped from the controller's text; the
  // rest of the element stays byte-identical.
  //
  // Dropping the whole controller when a single signal moved would lose the
  // intersection's signal grouping for every OTHER signal too — the grouping
  // is not recoverable from the regenerated side, which only knows the
  // controllerId carried on traffic-light shapes.
  const verbatimControllers: { id: string; text: string }[] = []
  for (const c of doc.controllers) {
    if (c.signalIds.length === 0) continue
    const keptSignalIds = c.signalIds.filter(sid => carriedSignalIds.has(sid))
    if (keptSignalIds.length === 0) continue
    verbatimControllers.push({
      id: c.id,
      text:
        keptSignalIds.length === c.signalIds.length
          ? c.text
          : dropControlRecords(c.text, new Set(keptSignalIds)),
    })
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
    surgicalRoadText,
    dirtyJunctionIds,
    carriedJunctionIds,
    verbatimJunctionTexts,
    junctionOfRegeneratedRoad,
    carriedJunctionOfRoad,
    carriedJunctionConnectingRoadIds,
    junctionLaneShapeIds,
    splitRetargets,
    carriedSignalIds,
    verbatimControllers,
    idBase: Math.max(doc.maxNumericElementId, 0) + 1,
    // Ids already handed to signals added on a surgically rewritten road are
    // spent; regeneration continues above them.
    signalIdBase: nextSurgicalSignalId,
    surgicalSignalIdByShape,
    controllerIdBase: Math.max(doc.maxNumericControllerId, 0) + 1,
  }
}

/**
 * One round of "plan the carry-through, then build the bundles it assumed".
 *
 * Which junctions can keep their <connection> table depends on where the
 * bundles put each lane, and which lanes there are to bundle depends on which
 * roads the plan decided to regenerate. The two are settled together: this
 * function plans, builds, then re-checks every carried junction against the
 * bundles that came out, and reports in `newlyRejected` the junctions whose
 * table did not survive the check. The caller re-runs it with those seeded as
 * rebuildable until nothing new is rejected, so the plan that is finally used
 * is the one the bundles actually agree with.
 */
function planBundlesAndJunctions(
  sidecar: OdrSidecar | null | undefined,
  shapeMap: Map<string, BaseShape>,
  lanes: LaneShape[],
  trafficLights: TrafficLightShape[],
  trafficSigns: TrafficSignShape[],
  crosswalks: CrosswalkShape[],
  pointOverrides: Map<string, Point2D>,
  forcedRebuildableJunctionIds: ReadonlySet<string>
): {
  carry: CarryPlan | null
  exportBundles: ExportBundle[]
  roadIdByBundle: Map<ExportBundle, number>
  laneIdToRoadId: Map<string, number>
  laneIdToOdrLaneId: Map<string, number>
  nextRoadId: number
  junctionOfExportedRoad: Map<number, string>
  carriedJunction: { ofLane: Map<string, string>; onConnectingRoad: Set<string> }
  splitRetargetOf: Map<string, Map<string, string>>
  externalLanes: Map<string, LaneShape>
  connectingSourceFor: (laneShapeId: string) => ConnectingSource | null
  connectingTargetFor: (laneShapeId: string) => ConnectingTarget | null
  contactWidth: (laneShapeId: string, contact: 'start' | 'end') => number | null
  newlyRejected: Set<string>
} {
  const carry = planCarryThrough(
    sidecar, shapeMap, trafficLights, trafficSigns, crosswalks, forcedRebuildableJunctionIds
  )
  const regenLanes = carry ? lanes.filter(l => !carry.verbatimLaneIds.has(l.id)) : lanes
  /** Junctions this round found unusable that the plan had still carried. */
  const newlyRejected = new Set<string>()

  // Group laterally adjacent lanes into road bundles and build their
  // geometry. Degenerate bundles (zero-length reference lines) are dropped;
  // a multi-lane bundle whose geometry cannot be built (broken boundary
  // references) degrades to per-lane bundles so one bad lane does not drop
  // its neighbours.
  const exportBundles: ExportBundle[] = []
  for (const bundleLanes of detectBundles(regenLanes)) {
    const leftSide = isLeftSideBundle(bundleLanes)
    const geom = buildBundleGeometry(shapeMap, bundleLanes, pointOverrides, leftSide)
    if (geom && geom.length >= 0.01) {
      exportBundles.push({ lanes: bundleLanes, geom, leftSide })
    } else if (bundleLanes.length > 1) {
      for (const lane of bundleLanes) {
        const laneLeft = isLeftSideBundle([lane])
        const g = buildBundleGeometry(shapeMap, [lane], pointOverrides, laneLeft)
        if (g && g.length >= 0.01) exportBundles.push({ lanes: [lane], geom: g, leftSide: laneLeft })
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
  /**
   * Lane set -> the original road it is the whole of. Same keys as
   * `reusableRoadIds` starts with, but kept whole: that one is consumed as
   * bundles claim their ids, and the emit side still has to ask who a lane set
   * WOULD have belonged to.
   */
  const exactMatchRoadId = new Map<string, number>()
  /** Lane shape id -> the dirty original road that materialized it. */
  const originRoadOfLane = new Map<string, number>()
  if (carry) {
    for (const rid of carry.dirtyRecordedIds) {
      const rec = carry.records[rid]
      if (!rec || rec.laneShapeIds.length === 0 || !/^\d+$/.test(rid)) continue
      const numeric = parseInt(rid, 10)
      reusableRoadIds.set(reuseKey(rec.laneShapeIds), numeric)
      exactMatchRoadId.set(reuseKey(rec.laneShapeIds), numeric)
      for (const lid of rec.laneShapeIds) originRoadOfLane.set(lid, numeric)
    }
  }
  const laneIdToRoadId = new Map<string, number>()
  const laneIdToOdrLaneId = new Map<string, number>()
  const roadIdByBundle = new Map<ExportBundle, number>()
  let nextRoadId = carry ? carry.idBase : 1
  /** Original road ids already claimed by a bundle (each is reusable once). */
  const claimedOriginIds = new Set<number>()
  /**
   * Original id a bundle may inherit when its lane set does not match a road
   * exactly: the road that contributed most of the bundle's lanes, provided
   * that road is not still available for an exact match elsewhere. Editing can
   * re-bundle a road's lanes (splitting one road into several, or merging
   * neighbours), and without this the whole group would take fresh ids and
   * break every id-based cross-reference an external tool holds.
   */
  const dominantOriginId = (bundle: ExportBundle): number | undefined => {
    const votes = new Map<number, number>()
    for (const l of bundle.lanes) {
      const origin = originRoadOfLane.get(l.id)
      if (origin === undefined) continue
      votes.set(origin, (votes.get(origin) ?? 0) + 1)
    }
    let best: number | undefined
    let bestVotes = 0
    for (const [origin, n] of votes) {
      if (claimedOriginIds.has(origin)) continue
      if (n > bestVotes) {
        best = origin
        bestVotes = n
      }
    }
    return best
  }
  // Exact lane-set matches are resolved first, so a bundle can never claim an
  // id by majority that another bundle would have inherited outright.
  const exactReuse = new Map<ExportBundle, number>()
  for (const bundle of exportBundles) {
    const key = reuseKey(bundle.lanes.map(l => l.id))
    const reused = reusableRoadIds.get(key)
    if (reused === undefined) continue
    reusableRoadIds.delete(key)
    exactReuse.set(bundle, reused)
    claimedOriginIds.add(reused)
  }
  // A road with lanes on both sides splits into two bundles, and only one of
  // them can inherit the road's id. When a <junction> the export means to
  // carry names one of the two sides, that side has to be the one that gets
  // the id — otherwise the carried <connection> would point at a road that no
  // longer has the lanes it names, and the whole intersection falls back to
  // being synthesized. Majority voting alone picks by bundle order, which has
  // nothing to do with which side the intersection uses.
  if (carry) {
    // Lane shape -> its bundle, built once. Scanning every bundle for every
    // carried road is quadratic in the number of edited roads, which on a
    // few-thousand-road map is the difference between seconds and minutes.
    const bundleOfLaneShape = new Map<string, ExportBundle>()
    const bundleOrder = new Map<ExportBundle, number>()
    exportBundles.forEach((b, i) => {
      bundleOrder.set(b, i)
      for (const l of b.lanes) bundleOfLaneShape.set(l.id, b)
    })
    for (const [rid, jid] of carry.carriedJunctionOfRoad) {
      if (carry.dirtyJunctionIds.has(jid) || !/^\d+$/.test(rid)) continue
      const origin = parseInt(rid, 10)
      if (claimedOriginIds.has(origin)) continue
      const wanted = carry.junctionLaneShapeIds.get(rid)
      if (!wanted || wanted.size === 0) continue
      // Same choice the old full scan made: the earliest unclaimed bundle
      // in bundle order that holds one of the lanes the table names.
      let bundle: ExportBundle | undefined
      for (const lid of wanted) {
        const b = bundleOfLaneShape.get(lid)
        if (!b || exactReuse.has(b)) continue
        if (!bundle || bundleOrder.get(b)! < bundleOrder.get(bundle)!) bundle = b
      }
      if (!bundle) continue
      exactReuse.set(bundle, origin)
      claimedOriginIds.add(origin)
    }
  }
  for (const bundle of exportBundles) {
    const reused = exactReuse.get(bundle) ?? dominantOriginId(bundle)
    if (reused !== undefined) claimedOriginIds.add(reused)
    const roadId = reused ?? nextRoadId++
    roadIdByBundle.set(bundle, roadId)
    bundle.lanes.forEach((lane, i) => {
      laneIdToRoadId.set(lane.id, roadId)
      laneIdToOdrLaneId.set(lane.id, bundle.leftSide ? i + 1 : -(i + 1))
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
      // The travel exit of a left-side bundle is the geometric start of its
      // reference line (left lanes run against s); the travel heading there
      // is the reference heading turned around. In the travel frame the
      // lanes sit toward the right normal either way, so the same offset
      // formula applies with the travel pose.
      const leftSide = loc.bundle.leftSide
      const exitGeom = leftSide ? geom.planView[0] : geom.planView[geom.planView.length - 1]
      const pose = evalGeometry(exitGeom, leftSide ? 0 : exitGeom.length)
      const hdg = leftSide ? wrapAngleRad(pose.hdg + Math.PI) : pose.hdg
      const exitIdx = leftSide ? 0 : geom.samplePoses.length - 1
      let offset = 0
      for (let m = 0; m < loc.index; m++) offset += geom.laneWidths[m][exitIdx]
      return {
        x: pose.x + Math.sin(hdg) * offset,
        y: pose.y - Math.cos(hdg) * offset,
        hdg,
        width: geom.laneWidths[loc.index][exitIdx],
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
      // The travel entry of a left-side bundle is the geometric end of its
      // reference line, with the travel heading turned around (see
      // connectingSourceFor).
      const leftSide = loc.bundle.leftSide
      const entryIdx = leftSide ? geom.samplePoses.length - 1 : 0
      const refPose = geom.samplePoses[entryIdx]
      const hdg = leftSide ? wrapAngleRad(refPose.hdg + Math.PI) : refPose.hdg
      let offset = 0
      for (let m = 0; m < loc.index; m++) offset += geom.laneWidths[m][entryIdx]
      return {
        x: refPose.x + Math.sin(hdg) * offset,
        y: refPose.y - Math.cos(hdg) * offset,
        hdg,
        width: geom.laneWidths[loc.index][entryIdx],
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
      // `contact` is travel-semantic; a left-side bundle's travel start sits
      // at the geometric end of its width samples.
      const atFirst = (contact === 'start') !== loc.bundle.leftSide
      return atFirst ? widths[0] : widths[widths.length - 1]
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

  // A carried <junction> names its members by id, so carrying it is only
  // sound when every regenerated member came back under the id the table
  // uses. Id inheritance normally delivers that (exactReuse), but a
  // re-bundling edit can hand a road's lanes to a different id, and then the
  // table would dangle. Verify it here and drop back to rebuilding the
  // intersection for any junction where it did not hold.
  const junctionOfExportedRoad = new Map<number, string>()
  const carriedJunction = { ofLane: new Map<string, string>(), onConnectingRoad: new Set<string>() }
  /**
   * Per carried member road, the road ids its <link> has to be re-pointed to
   * because the road it names gave those lanes to the other half of a split.
   * Resolved here, where the bundles are known, so emission and the carry
   * decision cannot disagree about where a reference ends up.
   */
  const splitRetargetOf = new Map<string, Map<string, string>>()
  if (carry) {
    /**
     * Roads the junction work queue below dirties. They were clean when the
     * bundles were built, so no bundle exists for them this round and their
     * emitted id is not yet decided; see the queue's comment and
     * `newlyDirtyLaneNumbers`.
     */
    const newlyDirtyRoads = new Set<string>()
    const bundleRoadOfLane = new Map<string, number>()
    for (const bundle of exportBundles) {
      const rid = roadIdByBundle.get(bundle)!
      for (const l of bundle.lanes) bundleRoadOfLane.set(l.id, rid)
    }
    /** The lane id a lane shape is actually emitted under. */
    const bundleLaneIdOfLane = laneIdToOdrLaneId
    /**
     * How a road the queue has just dirtied would re-bundle: its recorded
     * lanes, grouped the way the next round's bundles will group them, in the
     * order the next round will visit them, each with the lane number it would
     * come back under.
     *
     * Its bundle does not exist yet: it was clean when they were built, so its
     * lanes were not in the regeneration set at all. Reading that silence as
     * "it could not keep its id" rejects every junction downstream of the
     * first rejection, which is not what the one-junction-per-round loop
     * concluded and costs unedited data (see the queue's comment).
     *
     * Bundling is a local relation — laterally adjacent lanes sharing a
     * boundary — so running it over the road's own lanes reproduces the
     * grouping the next round will reach, and numbering each group from +/-1
     * outward reproduces the lane ids. Bundle order is the same key the plan
     * sorts by (the first lane's position in the snapshot), so the groups come
     * out in the order that decides who inherits the road's id.
     *
     * Conservative on purpose: anything this cannot establish (a lane shape
     * that is gone, an id that is not numeric, a group that would also be an
     * exact match for some OTHER road's recorded lane set and could claim that
     * id first) is a null, the same verdict the bundles would give next round.
     */
    type LocalBundle = { laneIds: Set<string>; numbers: Map<string, number> }
    const localBundleCache = new Map<string, LocalBundle[] | null>()
    const localBundlesOf = (rid: string): LocalBundle[] | null => {
      const cached = localBundleCache.get(rid)
      if (cached !== undefined) return cached
      const compute = (): LocalBundle[] | null => {
        const recorded = carry.records[rid]?.laneShapeIds ?? []
        if (recorded.length === 0) return null
        const laneShapes: LaneShape[] = []
        for (const lid of recorded) {
          const shape = shapeMap.get(lid)
          if (!shape || shape.type !== 'lane') return null
          laneShapes.push(shape as unknown as LaneShape)
        }
        const groups = detectBundles(laneShapes)
        if (groups.reduce((n, g) => n + g.length, 0) !== laneShapes.length) return null
        // Exact lane-set reuse is resolved before anything else, so a group
        // that exactly matches another road's recorded set takes THAT id and
        // is out of the running for this one. Rather than model the knock-on
        // effects, give up on the road.
        for (const group of groups) {
          const owner = exactMatchRoadId.get(reuseKey(group.map(l => l.id)))
          if (owner !== undefined && owner !== parseInt(rid, 10)) return null
        }
        const out = groups.map(group => {
          const leftSide = isLeftSideBundle(group)
          const numbers = new Map<string, number>()
          group.forEach((lane, i) => numbers.set(lane.id, leftSide ? i + 1 : -(i + 1)))
          return { laneIds: new Set(group.map(l => l.id)), numbers }
        })
        // Same sort key the plan uses for bundle order.
        const rank = (b: LocalBundle): number =>
          Math.min(...[...b.laneIds].map(lid => laneOrder.get(lid) ?? Number.MAX_SAFE_INTEGER))
        out.sort((a, b) => rank(a) - rank(b))
        return out
      }
      const result = compute()
      localBundleCache.set(rid, result)
      return result
    }
    /**
     * Which of those groups inherits the road's id, by the plan's own rules?
     *
     * A road whose lanes still form ONE group inherits outright. When editing
     * has broken it into several, exactly one of them still gets the id, and
     * the plan picks it in a fixed order: the side a live carried junction's
     * table names wins (`junctionLaneShapeIds`), because otherwise the
     * <connection> would point at a road that no longer has the lanes it
     * names; failing that, majority origin, which for groups made only of this
     * road's lanes is simply the first in bundle order.
     *
     * Deciding here rather than calling every split road a loss is what keeps
     * this in step with the plan: the plan does hand the id to one of them,
     * and treating that as "the id could not be kept" rejects junctions the
     * plan would have carried — taking their unedited roads' data with them.
     *
     * Read live, not cached: the junction preference is only available while
     * that junction is still carried, and the queue is in the middle of
     * deciding which ones are.
     */
    const localIdHeir = (rid: string): LocalBundle | null => {
      const groups = localBundlesOf(rid)
      if (groups === null) return null
      if (groups.length === 1) return groups[0]
      const jid = carry.carriedJunctionOfRoad.get(rid)
      if (jid !== undefined && !carry.dirtyJunctionIds.has(jid)) {
        const wanted = carry.junctionLaneShapeIds.get(rid)
        if (wanted && wanted.size > 0) {
          for (const group of groups) {
            if ([...wanted].some(lid => group.laneIds.has(lid))) return group
          }
        }
      }
      return groups[0]
    }

    /**
     * Is the lane a <connection> calls `laneId` of road `rid` really emitted
     * as lane `laneId` of road `rid`?
     *
     * Both halves matter. The road id can move — a road with lanes on both
     * sides splits into two bundles and only one inherits the id — and so
     * can the lane number, because a regenerated bundle is renumbered from
     * +/-1 outward and lanes the importer does not model are simply not
     * there to be counted. Checking only the road id let a table keep a
     * `to="-3"` that the emitted road had renumbered to `-2`.
     */
    const laneKeptItsRoadId = (rid: string, laneId: number, atEnd: 'start' | 'end'): boolean => {
      if (!carry.records[rid] || !/^\d+$/.test(rid)) return false
      if (carry.cleanRoadIds.has(rid)) return true
      if (newlyDirtyRoads.has(rid)) {
        const heir = localIdHeir(rid)
        if (heir === null) return false
        const lid = laneShapeWithOdrIdOnRoad(carry, shapeMap, rid, laneId, atEnd)
        return lid !== undefined && heir.numbers.get(lid) === laneId
      }
      const lid = laneShapeWithOdrIdOnRoad(carry, shapeMap, rid, laneId, atEnd)
      if (lid === undefined) return false
      return bundleRoadOfLane.get(lid) === parseInt(rid, 10) && bundleLaneIdOfLane.get(lid) === laneId
    }
    // Regenerated roads per junction, indexed once. Filtering the whole map
    // for every junction is quadratic in the number of intersections.
    const stampedByJunction = new Map<string, string[]>()
    for (const [rid, jid] of carry.junctionOfRegeneratedRoad) {
      const list = stampedByJunction.get(jid) ?? []
      list.push(rid)
      stampedByJunction.set(jid, list)
    }
    const docRoadTextById = new Map(carry.doc.roads.map(r => [r.id, r.text]))
    /**
     * Where a carried member's reference into a split road has to be
     * re-pointed, or null when it cannot be.
     *
     * A road <link> names ONE road, so following the lanes that moved is only
     * possible when they all moved to the same road AND kept the numbers the
     * reference uses. The plan checks that each lane can be found; only the
     * built bundles say where each one actually went, and an edit that breaks
     * the moving side into two bundles scatters them. Answering with the first
     * lane's new road (and applying it to the rest) pointed the other lanes at
     * a road that does not have them.
     */
    const splitRetargetTarget = ({ to, toAt, laneIds }: MemberEnd): number | null => {
      let target: number | null = null
      for (const laneId of laneIds) {
        const shapeId = laneShapeWithOdrIdOnRoad(carry, shapeMap, to, laneId, toAt)
        if (shapeId === undefined) return null
        const moved = bundleRoadOfLane.get(shapeId)
        if (moved === undefined) return null
        // The reference keeps its lane numbers, so the lane has to come back
        // under the very number the carried text names.
        if (bundleLaneIdOfLane.get(shapeId) !== laneId) return null
        if (target === null) target = moved
        else if (target !== moved) return null
      }
      return target
    }
    /** Members whose reference into a split road could not be re-pointed. */
    const brokenRetargetFrom = new Set<string>()
    for (const retarget of carry.splitRetargets) {
      const target = splitRetargetTarget(retarget)
      if (target === null) {
        brokenRetargetFrom.add(retarget.from)
        continue
      }
      if (String(target) === retarget.to) continue
      const forRoad = splitRetargetOf.get(retarget.from) ?? new Map<string, string>()
      forRoad.set(retarget.to, String(target))
      splitRetargetOf.set(retarget.from, forRoad)
    }
    // Rejecting a junction dirties its connecting roads, and a road that goes
    // dirty can break the NEXT junction's table — which used to be discovered
    // only on the following round, one junction per round. On a chain where
    // each connecting road is the next junction's incoming road, that is a
    // full re-plan (whole carry derivation, every dirty bundle re-fitted) per
    // junction: J rounds for J junctions.
    //
    // The consequences of a rejection are followed here instead, to a fixpoint
    // within this round, before the caller re-plans once with the whole set
    // seeded. A rejection can only ever ADD dirty roads, so re-checking the
    // junctions that touch a newly dirty road is enough — the rest cannot
    // have changed their answer. The caller's loop still runs (the plan has
    // to be rebuilt from the enlarged set), but it now converges in a couple
    // of rounds instead of tracking the chain length.
    //
    // This is not a round cap: nothing is emitted with an unsettled plan. The
    // fixpoint is the same one the outer loop reached, found sooner.
    //
    // Following the consequences early means asking about roads this round's
    // bundles say nothing about: a road the queue has just dirtied was clean
    // when the bundles were built, so it has no bundle, and it is the NEXT
    // round that builds one and settles which id it comes back under. Reading
    // that silence as "it could not keep its id" rejects every junction
    // downstream of the first rejection, and once rejected a junction is never
    // reconsidered — the answer differs from the one-junction-per-round loop's
    // and takes unedited data with it. `newlyDirtyRoads` keeps the two apart.

    /** Junctions whose table names this road, for re-checking on a change. */
    const junctionsTouchingRoad = new Map<string, Set<string>>()
    const noteTouch = (rid: string, jid: string): void => {
      if (!rid) return
      const set = junctionsTouchingRoad.get(rid) ?? new Set<string>()
      set.add(jid)
      junctionsTouchingRoad.set(rid, set)
    }
    /** Parsed once per junction; the check runs many times. */
    const connectionsOf = new Map<
      string,
      { incoming: string; connecting: string; incomingAt: 'start' | 'end'; connectingAt: 'start' | 'end'; links: { from: number; to: number }[] }[]
    >()
    for (const j of carry.doc.junctions) {
      const list: NonNullable<ReturnType<typeof connectionsOf.get>> = []
      for (const conn of j.connections) {
        const incomingAt: 'start' | 'end' = new RegExp(
          `<predecessor\\s+elementType="junction"\\s+elementId="${j.id}"`
        ).test(docRoadTextById.get(conn.incomingRoad) ?? '')
          ? 'start'
          : 'end'
        list.push({
          incoming: conn.incomingRoad,
          connecting: conn.connectingRoad,
          incomingAt,
          connectingAt: conn.contactPoint ?? 'start',
          links: conn.laneLinks,
        })
        noteTouch(conn.incomingRoad, j.id)
        noteTouch(conn.connectingRoad, j.id)
      }
      connectionsOf.set(j.id, list)
      for (const rid of stampedByJunction.get(j.id) ?? []) noteTouch(rid, j.id)
    }

    /** Can this junction still keep its table, given the current dirty set? */
    const junctionKeepsTable = (j: OdrDocJunction): boolean => {
      if ([...brokenRetargetFrom].some(from => carry.carriedJunctionOfRoad.get(from) === j.id)) {
        return false
      }
      for (const conn of connectionsOf.get(j.id) ?? []) {
        for (const { from, to } of conn.links) {
          if (
            !laneKeptItsRoadId(conn.incoming, from, conn.incomingAt) ||
            !laneKeptItsRoadId(conn.connecting, to, conn.connectingAt)
          ) {
            return false
          }
        }
      }
      // A regenerated connecting road is about to be stamped with this
      // junction, so it must have come back under the id the table names.
      for (const rid of stampedByJunction.get(j.id) ?? []) {
        const rec = carry.records[rid]
        if (!rec || !/^\d+$/.test(rid)) return false
        const want = parseInt(rid, 10)
        if (!rec.laneShapeIds.every(lid => bundleRoadOfLane.get(lid) === want)) return false
      }
      return true
    }

    const junctionById = new Map(carry.doc.junctions.map(j => [j.id, j]))
    const isLive = (jid: string): boolean =>
      carry.carriedJunctionIds.has(jid) && !carry.dirtyJunctionIds.has(jid)

    const queue: string[] = []
    for (const j of carry.doc.junctions) if (isLive(j.id)) queue.push(j.id)
    const queued = new Set(queue)
    while (queue.length > 0) {
      const jid = queue.shift()!
      queued.delete(jid)
      if (!isLive(jid)) continue
      const j = junctionById.get(jid)
      if (!j || junctionKeepsTable(j)) continue

      // The table cannot be carried. Record it and let the caller re-plan
      // with this junction seeded as rebuildable, so the plan's own fixpoint
      // decides what that costs (which roads regenerate, which shapes are
      // consumed) rather than the emit side patching a plan that has already
      // been used to decide everything else.
      if (!forcedRebuildableJunctionIds.has(jid)) newlyRejected.add(jid)
      carry.dirtyJunctionIds.add(jid)

      // Its connecting roads now regenerate, so any junction whose table
      // names one of them has to answer the question again.
      const touched = new Set<string>()
      for (const conn of connectionsOf.get(jid) ?? []) touched.add(conn.connecting)
      for (const rid of stampedByJunction.get(jid) ?? []) touched.add(rid)
      for (const [rid, owner] of carry.carriedJunctionOfRoad) {
        if (owner === jid) touched.add(rid)
      }
      for (const rid of touched) {
        if (carry.cleanRoadIds.has(rid)) {
          carry.cleanRoadIds.delete(rid)
          // It regenerates from the next round on, and only that round can
          // say under which id. Until then it is unanswered, not failed.
          newlyDirtyRoads.add(rid)
        }
        for (const other of junctionsTouchingRoad.get(rid) ?? []) {
          if (other === jid || queued.has(other) || !isLive(other)) continue
          queue.push(other)
          queued.add(other)
        }
      }
    }

    for (const j of carry.doc.junctions) {
      if (!isLive(j.id)) continue
      for (const rid of stampedByJunction.get(j.id) ?? []) {
        junctionOfExportedRoad.set(parseInt(rid, 10), j.id)
      }
    }

    for (const [rid, jid] of carry.carriedJunctionOfRoad) {
      if (carry.dirtyJunctionIds.has(jid)) continue
      const connecting = carry.carriedJunctionConnectingRoadIds.has(rid)
      for (const lid of carry.records[rid]?.laneShapeIds ?? []) {
        carriedJunction.ofLane.set(lid, jid)
        if (connecting) carriedJunction.onConnectingRoad.add(lid)
      }
    }
    // Junctions dropped above must no longer be emitted verbatim.
    carry.verbatimJunctionTexts = carry.doc.junctions
      .filter(j => !carry.dirtyJunctionIds.has(j.id))
      .map(j => j.text)
  }

  return {
    carry,
    exportBundles,
    roadIdByBundle,
    laneIdToRoadId,
    laneIdToOdrLaneId,
    nextRoadId,
    junctionOfExportedRoad,
    carriedJunction,
    splitRetargetOf,
    externalLanes,
    connectingSourceFor,
    connectingTargetFor,
    contactWidth,
    newlyRejected,
  }
}

/**
 * Counters for the plan / build fixpoint, for the performance regression
 * tests. Not part of the public API and not read by the exporter itself.
 */
export const __replanCounters = {
  /** Times the whole carry plan + bundle build was run for one export. */
  planRounds: 0,
  /** Junctions newly rejected in each round after the first. */
  rejectedPerRound: [] as number[],
  reset(): void {
    this.planRounds = 0
    this.rejectedPerRound = []
  },
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

  const pointOverrides = buildBoundaryAlignmentOverrides(shapeMap, lanes)

  // Carry-through: with an importer sidecar, unedited original roads are
  // re-emitted verbatim and excluded from regeneration.
  //
  // Whether a junction's <connection> table can be carried depends on facts
  // only the built bundles know (which road id each lane ends up on, and
  // under which lane number). So planning and bundle building run as one
  // loop: when the check below rejects a junction the plan had carried, the
  // whole plan is recomputed with that junction seeded as rebuildable, and
  // the bundles are rebuilt from the new plan. Patching the settled plan from
  // here instead — withdrawing the maps the junction appeared in without
  // redoing cleanRoadIds / verbatimRoads / the lane partition — left roads
  // stamped with a junction the output no longer emitted, and neighbours
  // linking to it.
  //
  // Each round moves at least one junction from carried to rebuildable and
  // never back, so the loop runs at most (number of junctions) + 1 times.
  const rejectedJunctionIds = new Set<string>()
  __replanCounters.planRounds++
  let planned = planBundlesAndJunctions(
    options.sidecar, shapeMap, lanes, trafficLights, trafficSigns, crosswalks,
    pointOverrides, rejectedJunctionIds
  )
  while (planned.newlyRejected.size > 0) {
    __replanCounters.planRounds++
    __replanCounters.rejectedPerRound.push(planned.newlyRejected.size)
    for (const jid of planned.newlyRejected) rejectedJunctionIds.add(jid)
    planned = planBundlesAndJunctions(
      options.sidecar, shapeMap, lanes, trafficLights, trafficSigns, crosswalks,
      pointOverrides, rejectedJunctionIds
    )
  }
  const { carry, exportBundles, roadIdByBundle, laneIdToRoadId, laneIdToOdrLaneId,
    nextRoadId, junctionOfExportedRoad, carriedJunction, splitRetargetOf,
    externalLanes, connectingSourceFor, connectingTargetFor, contactWidth } = planned
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


  const plan = planConnectivity(
    exportBundles,
    laneIdToRoadId,
    laneIdToOdrLaneId,
    nextRoadId,
    connectingSourceFor,
    connectingTargetFor,
    contactWidth,
    externalLanes,
    carriedJunction
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

  // A <signalReference> living in carried text names a signal by id. Now that
  // both paths have run, each named id is in exactly one of three states:
  //
  //   - still defined in carried text            -> leave the reference alone
  //   - re-emitted by regeneration under a new id -> retarget to that id,
  //     keeping the reference's own s / t / orientation / validity, which the
  //     regeneration path does not know
  //   - defined nowhere                           -> the user deleted it, so
  //     the reference goes
  //
  // Deciding this while planning collapsed the middle case into the last one:
  // a reference to a signal whose road was merely edited was deleted, and on a
  // road with no lane shapes nothing re-emitted it.
  const finalSignalIdBySourceId = new Map<string, string>()
  if (carry) {
    for (const [shapeId, id] of signalIdByShape) {
      const shape = shapeMap.get(shapeId)
      const sourceId = (shape as unknown as TrafficLightShape | undefined)?.props?.attributes
        ?.odr_signal_id
      if (sourceId) finalSignalIdBySourceId.set(sourceId, String(id))
    }
  }
  const retargetSignalReferences = (text: string): string =>
    carry === null
      ? text
      : rewriteSignalReferences(text, sid =>
          carry.carriedSignalIds.has(sid) ? sid : (finalSignalIdBySourceId.get(sid) ?? null)
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
    // A road the junction plan let split gave its id to one side; a carried
    // member reaching the other side is re-pointed at the road that took
    // those lanes (resolved with the bundles, in splitRetargetOf), so its
    // <successor>/<predecessor> still resolves.
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
      // Surgical roads reuse the verbatim emission path (same link rewriting)
      // but start from the width-rewritten text instead of the original.
      const baseText = retargetSignalReferences(carry.surgicalRoadText.get(r.id) ?? r.text)
      const roadMap = splitRetargetOf.get(r.id)
      lines.push(
        rewriteRoadLinkTargets(
          baseText,
          roadMap ? new Map([...rewriteMap, ...roadMap]) : rewriteMap,
          junctionMap ?? new Map()
        )
      )
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
        laneIdToOdrLaneId,
        junctionOfExportedRoad.get(roadId)
      )
    )
  }

  // Synthesized junction connecting roads (standard incoming -> connecting ->
  // outgoing structure; see planConnectivity).
  for (const spec of plan.connectingRoads) {
    lines.push(emitConnectingRoad(spec))
  }

  // Signal groups: traffic lights sharing a controllerId (one intersection)
  // become a <controller> listing their emitted signals as <control> records.
  // Imported lights carry the original controller id, so a group whose
  // controller also survives verbatim is merged back into that element
  // instead of being emitted twice under a fresh id.
  // Ids are strings: a regenerated signal's is a number, but one carried
  // through the surgical rewrite keeps whatever spelling the source used.
  const controllerGroups = new Map<string, string[]>()
  const addToControllerGroup = (groupId: string, signalId: string): void => {
    const group = controllerGroups.get(groupId) ?? []
    group.push(signalId)
    controllerGroups.set(groupId, group)
  }
  for (const tl of regenTrafficLights) {
    const groupId = tl.props.controllerId
    if (!groupId) continue
    const signalId = signalIdByShape.get(tl.id)
    if (signalId === undefined) continue
    addToControllerGroup(groupId, String(signalId))
  }
  // Lights on surgically rewritten roads never reach the regeneration path.
  // A light that KEPT its source id is already named by the verbatim
  // <controller>; one that was ADDED holds a fresh id that nothing lists yet,
  // so it joins its group here. The plan only keeps an entry here for a road
  // whose surgical text was really emitted, so every id named below is defined
  // in the output (see the fixpoint cleanup in planCarryThrough).
  if (carry) {
    const originalSignalIds = new Set(carry.doc.roads.flatMap(r => r.signalIds))
    for (const tl of trafficLights) {
      const groupId = tl.props.controllerId
      if (!groupId) continue
      const signalId = carry.surgicalSignalIdByShape.get(tl.id)
      if (signalId === undefined || originalSignalIds.has(signalId)) continue
      addToControllerGroup(groupId, signalId)
    }
  }

  /**
   * What became of each ORIGINAL `<controller id>`: the id it is emitted
   * under now, or absent when no controller for that group is emitted at all.
   * A `<junction>` may name a controller, and carrying the junction's text
   * verbatim keeps that name — which has to still resolve.
   *
   * An imported traffic light carries its source controller id as its group
   * id, so a group regenerating under a fresh id is exactly this mapping.
   */
  const finalControllerIdByOriginal = new Map<string, string>()

  // Verbatim controllers, with regenerated signals of the same group folded
  // back in as extra <control> records.
  if (carry) {
    for (const { id, text } of carry.verbatimControllers) {
      const regenerated = controllerGroups.get(id)
      finalControllerIdByOriginal.set(id, id)
      if (regenerated === undefined) {
        lines.push(text)
        continue
      }
      controllerGroups.delete(id)
      lines.push(appendControlRecords(text, regenerated))
    }
  }

  let controllerIdCounter = carry ? carry.controllerIdBase : 1
  for (const [groupId, signalIds] of controllerGroups) {
    const id = controllerIdCounter++
    finalControllerIdByOriginal.set(groupId, String(id))
    lines.push(`  <controller id="${id}" name="${escapeXml(groupId)}" sequence="0">`)
    for (const signalId of signalIds) {
      lines.push(`    <control signalId="${signalId}" type="0"/>`)
    }
    lines.push(`  </controller>`)
  }

  // Verbatim junctions (all member roads verbatim), with their <controller>
  // references re-pointed at the ids the controllers really came out under
  // and references to controllers that are gone removed. Without this a
  // carried junction went on naming a controller the deleted signal took with
  // it, or the source id of one that regenerated.
  if (carry) {
    for (const text of carry.verbatimJunctionTexts) {
      lines.push(rewriteJunctionControllerRefs(text, finalControllerIdByOriginal))
    }
  }

  // Synthesized junctions for branch / merge connectivity (see planConnectivity).
  for (const junction of plan.junctions) {
    lines.push(`  <junction id="${junction.id}" name="junction${junction.id}">`)
    junction.connections.forEach((conn, idx) => {
      lines.push(
        `    <connection id="${idx}" incomingRoad="${conn.incoming}" connectingRoad="${conn.connecting}" contactPoint="${conn.contactPoint ?? 'start'}">`
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
