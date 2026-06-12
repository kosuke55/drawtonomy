// OpenDRIVE 1.8 (.xodr) exporter — emits a road network from a snapshot.
// No external library dependencies.
//
// Design:
// - Each lane is emitted as an independent <road>
// - Reference line is the midpoints of the left/right boundary samples
// - Each segment is a <line> geometry; lane width is a per-sample <width>
// - Lane connectivity (next/prev) is written into <link>; branch/merge edges
//   that a single road link cannot express are synthesized into <junction>
//   elements (see planJunctions)
// - Lanelet-only lane tags are stashed in <userData code="laneAttributes">
//   and restored on import; multi-road signal validity uses <signalReference>
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
} from '../types'
import { computeCenterlineWithWidth, type Point2D, type CenterlineSample } from './laneCenterline'
import { originToProjString } from './projection'
import { escapeXml, fmt, pxToEnuX, pxToEnuY, pxToMeter } from './units'

type LaneShape = BaseShape<'lane', LaneProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>
type TrafficLightShape = BaseShape<'traffic_light', TrafficLightProps>
type CrosswalkShape = BaseShape<'crosswalk', CrosswalkProps>
type PolygonShape = BaseShape<'polygon', PolygonProps>

interface RoadGeometry {
  laneId: string
  samples: CenterlineSample[]
  /** Centerline samples in OpenDRIVE meters. */
  odrSamples: { x: number; y: number; width: number; s: number }[]
  /** Total arc length (m). */
  length: number
}

/** O(1) shape lookup by id. */
function buildShapeMap(shapes: readonly BaseShape[]): Map<string, BaseShape> {
  const map = new Map<string, BaseShape>()
  for (const s of shapes) map.set(s.id, s)
  return map
}

/**
 * Build the centerline + width samples for a lane from its two boundaries.
 * If pointOverrides is provided, those point ids are read from the override
 * map instead of from the shape map (used for boundary alignment snapping).
 */
function buildRoadGeometry(
  shapeMap: Map<string, BaseShape>,
  lane: LaneShape,
  pointOverrides: Map<string, Point2D>
): RoadGeometry | null {
  const leftId = lane.props.leftBoundaryId
  const rightId = lane.props.rightBoundaryId
  if (!leftId || !rightId) return null

  const left = shapeMap.get(leftId) as unknown as LinestringShape | undefined
  const right = shapeMap.get(rightId) as unknown as LinestringShape | undefined
  if (!left || !right) return null

  const leftPts = collectPoints(shapeMap, left.props.pointIds, lane.props.invertLeft, pointOverrides)
  const rightPts = collectPoints(shapeMap, right.props.pointIds, lane.props.invertRight, pointOverrides)
  if (leftPts.length < 2 || rightPts.length < 2) return null

  const samples = computeCenterlineWithWidth(leftPts, rightPts)
  if (samples.length < 2) return null

  const odrSamples = samples.map((s) => ({
    x: pxToEnuX(s.x),
    y: pxToEnuY(s.y),
    width: pxToMeter(s.width),
    s: pxToMeter(s.s),
  }))
  const length = odrSamples[odrSamples.length - 1].s

  return { laneId: lane.id, samples, odrSamples, length }
}

function collectPoints(
  shapeMap: Map<string, BaseShape>,
  pointIds: string[],
  invert: boolean,
  pointOverrides: Map<string, Point2D>
): Point2D[] {
  const ids = invert ? [...pointIds].reverse() : pointIds
  const pts: Point2D[] = []
  for (const id of ids) {
    const ov = pointOverrides.get(id)
    if (ov) {
      pts.push({ x: ov.x, y: ov.y })
      continue
    }
    const p = shapeMap.get(id) as unknown as PointShape | undefined
    if (p) pts.push({ x: p.x, y: p.y })
  }
  return pts
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
  type Endpoint = { pointId: string; laneId: string; side: 'start' | 'end'; x: number; y: number }
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
      endpoints.push({ pointId: pid, laneId: lane.id, side, x: pt.x, y: pt.y })
    }
  }

  // Restrict to lanes that participate in a next/prev relationship.
  for (const lane of lanes) {
    const hasNext = (lane.props.next || []).some((id) => laneIds.has(id))
    const hasPrev = (lane.props.prev || []).some((id) => laneIds.has(id))
    if (hasNext) collectEndpoints(lane, 'end')
    if (hasPrev) collectEndpoints(lane, 'start')
  }

  // Greedy clustering: group points within epsilon of each other, with two
  // refinements over plain first-fit grouping:
  // 1. An endpoint never joins a cluster that already holds the opposite end
  //    of the same lane. A connecting lane shorter than epsilon would
  //    otherwise get its start and end merged into one cluster, collapsing
  //    its centerline below the degenerate-road export guard and silently
  //    dropping the lane (and its next/prev chain).
  // 2. Among the eligible clusters the nearest one wins, so the far end of a
  //    short lane clusters with its true counterpart rather than with the
  //    first cluster found within epsilon.
  const clusters: Endpoint[][] = []
  const eps2 = epsilonPx * epsilonPx
  for (const ep of endpoints) {
    let best: Endpoint[] | null = null
    let bestD2 = Infinity
    for (const cluster of clusters) {
      const c0 = cluster[0]
      const dx = ep.x - c0.x
      const dy = ep.y - c0.y
      const d2 = dx * dx + dy * dy
      if (d2 > eps2 || d2 >= bestD2) continue
      const conflictsOwnLane = cluster.some(
        (m) => m.laneId === ep.laneId && m.side !== ep.side
      )
      if (conflictsOwnLane) continue
      best = cluster
      bestD2 = d2
    }
    if (best) best.push(ep)
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

function emitPlanView(geom: RoadGeometry): string {
  const lines: string[] = []
  lines.push(`    <planView>`)
  for (let i = 0; i < geom.odrSamples.length - 1; i++) {
    const a = geom.odrSamples[i]
    const b = geom.odrSamples[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    if (segLen < 1e-9) continue
    const hdg = Math.atan2(dy, dx)
    lines.push(
      `      <geometry s="${fmt(a.s)}" x="${fmt(a.x)}" y="${fmt(a.y)}" hdg="${fmt(hdg)}" length="${fmt(segLen)}">`
    )
    lines.push(`        <line/>`)
    lines.push(`      </geometry>`)
  }
  lines.push(`    </planView>`)
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
  return ls?.props?.attributes?.subtype === 'dashed' ? 'broken' : 'solid'
}

function emitLanes(
  geom: RoadGeometry,
  hasPrev: boolean,
  hasNext: boolean,
  laneType: string,
  centerMark: string,
  outerMark: string
): string {
  const lines: string[] = []
  lines.push(`    <lanes>`)
  // The plan view follows the lane centerline; shifting the lane reference by
  // +width/2 puts center lane 0 on the lane's left boundary, so a single
  // right lane (-1) spans the full lane width. One drawtonomy lane therefore
  // maps to exactly one OpenDRIVE driving lane (not two half-width lanes).
  emitLaneOffsetEntries(geom, lines)
  lines.push(`      <laneSection s="0">`)
  // Center reference line (= left boundary after the laneOffset shift).
  lines.push(`        <center>`)
  lines.push(`          <lane id="0" type="none" level="false">`)
  lines.push(`            <link/>`)
  lines.push(`            <roadMark sOffset="0" type="${centerMark}" weight="standard" color="white" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </center>`)
  lines.push(`        <right>`)
  lines.push(`          <lane id="-1" type="${laneType}" level="false">`)
  emitLaneLink(lines, hasPrev, hasNext, -1)
  emitWidthEntries(geom, lines)
  lines.push(`            <roadMark sOffset="0" type="${outerMark}" weight="standard" color="white" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </right>`)
  lines.push(`      </laneSection>`)
  lines.push(`    </lanes>`)
  return lines.join('\n')
}

function emitLaneLink(out: string[], hasPrev: boolean, hasNext: boolean, laneId: number): void {
  if (!hasPrev && !hasNext) {
    out.push(`            <link/>`)
    return
  }
  out.push(`            <link>`)
  if (hasPrev) {
    out.push(`              <predecessor id="${laneId}"/>`)
  }
  if (hasNext) {
    out.push(`              <successor id="${laneId}"/>`)
  }
  out.push(`            </link>`)
}

/** Piecewise-linear laneOffset records: +width/2 toward the left boundary. */
function emitLaneOffsetEntries(geom: RoadGeometry, out: string[]): void {
  for (let i = 0; i < geom.odrSamples.length - 1; i++) {
    const s = geom.odrSamples[i].s
    const halfA = geom.odrSamples[i].width / 2
    const halfB = geom.odrSamples[i + 1].width / 2
    const segLen = geom.odrSamples[i + 1].s - s
    const b = segLen > 1e-9 ? (halfB - halfA) / segLen : 0
    out.push(`      <laneOffset s="${fmt(s)}" a="${fmt(halfA)}" b="${fmt(b)}" c="0" d="0"/>`)
  }
}

/** Piecewise-linear full lane width records: a + b*ds (c=d=0). */
function emitWidthEntries(geom: RoadGeometry, out: string[]): void {
  for (let i = 0; i < geom.odrSamples.length - 1; i++) {
    const s = geom.odrSamples[i].s
    const wA = geom.odrSamples[i].width
    const wB = geom.odrSamples[i + 1].width
    const segLen = geom.odrSamples[i + 1].s - s
    const b = segLen > 1e-9 ? (wB - wA) / segLen : 0
    out.push(`            <width sOffset="${fmt(s)}" a="${fmt(wA)}" b="${fmt(b)}" c="0" d="0"/>`)
  }
}

interface JunctionPlan {
  /** Junction id routing a lane's outgoing (next) edges, when present. */
  nextJunction: Map<string, number>
  /** Junction id routing a lane's incoming (prev) edges, when present. */
  prevJunction: Map<string, number>
  /** Junction id stamped on a connecting road (<road junction="...">). */
  roadJunction: Map<string, number>
  junctions: { id: number; connections: { incoming: number; connecting: number }[] }[]
}

/**
 * Plan synthesized <junction> elements for branch / merge connectivity.
 *
 * A road <link> can name only one predecessor and one successor, so an edge
 * is representable as plain road links only when it is its source's only
 * `next` AND its target's only `prev`. Every other edge (branching or
 * merging) is routed through a synthesized junction: the target roads become
 * connecting roads (their <road junction> attribute is set) and each edge is
 * emitted as a <connection incomingRoad connectingRoad contactPoint="start">
 * carrying a <laneLink from="-1" to="-1"/> (the exporter emits exactly one
 * driving lane -1 per road). Edges that share a lane collapse into the same
 * junction (connected components), so a 2-in x 2-out diamond becomes one
 * junction with four connections.
 */
function planJunctions(
  lanes: LaneShape[],
  laneIdToRoadId: Map<string, number>,
  firstJunctionId: number
): JunctionPlan {
  const validNext = new Map<string, string[]>()
  const validPrev = new Map<string, string[]>()
  for (const lane of lanes) {
    if (!laneIdToRoadId.has(lane.id)) continue
    validNext.set(lane.id, (lane.props.next ?? []).filter((id) => laneIdToRoadId.has(id)))
    validPrev.set(lane.id, (lane.props.prev ?? []).filter((id) => laneIdToRoadId.has(id)))
  }

  // Union-find over the lanes participating in junction-routed edges.
  const parent = new Map<string, string>()
  const find = (x: string): string => {
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
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  const junctionEdges: { from: string; to: string }[] = []
  for (const [laneId, nexts] of validNext) {
    for (const to of nexts) {
      const prevsOfTarget = validPrev.get(to) ?? []
      if (nexts.length === 1 && prevsOfTarget.length === 1) continue // plain road link
      junctionEdges.push({ from: laneId, to })
      union(laneId, to)
    }
  }

  const plan: JunctionPlan = {
    nextJunction: new Map(),
    prevJunction: new Map(),
    roadJunction: new Map(),
    junctions: [],
  }
  const junctionByRoot = new Map<string, JunctionPlan['junctions'][number]>()
  let nextId = firstJunctionId
  for (const e of junctionEdges) {
    const root = find(e.from)
    let junction = junctionByRoot.get(root)
    if (!junction) {
      junction = { id: nextId++, connections: [] }
      junctionByRoot.set(root, junction)
      plan.junctions.push(junction)
    }
    junction.connections.push({
      incoming: laneIdToRoadId.get(e.from)!,
      connecting: laneIdToRoadId.get(e.to)!,
    })
    plan.nextJunction.set(e.from, junction.id)
    plan.prevJunction.set(e.to, junction.id)
    plan.roadJunction.set(e.to, junction.id)
  }
  return plan
}

function emitLink(
  lane: LaneShape,
  laneIdToRoadId: Map<string, number>,
  junctionPlan: JunctionPlan
): string {
  const lines: string[] = []
  lines.push(`    <link>`)
  const prevJunction = junctionPlan.prevJunction.get(lane.id)
  if (prevJunction !== undefined) {
    lines.push(`      <predecessor elementType="junction" elementId="${prevJunction}"/>`)
  } else {
    const prevLane = (lane.props.prev ?? []).find((id) => laneIdToRoadId.has(id))
    if (prevLane) {
      const rid = laneIdToRoadId.get(prevLane)!
      lines.push(`      <predecessor elementType="road" elementId="${rid}" contactPoint="end"/>`)
    }
  }
  const nextJunction = junctionPlan.nextJunction.get(lane.id)
  if (nextJunction !== undefined) {
    lines.push(`      <successor elementType="junction" elementId="${nextJunction}"/>`)
  } else {
    const nextLane = (lane.props.next ?? []).find((id) => laneIdToRoadId.has(id))
    if (nextLane) {
      const rid = laneIdToRoadId.get(nextLane)!
      lines.push(`      <successor elementType="road" elementId="${rid}" contactPoint="start"/>`)
    }
  }
  lines.push(`    </link>`)
  return lines.join('\n')
}

function projectToRoad(geom: RoadGeometry, xG: number, yG: number): {
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
  const samples = geom.odrSamples
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
      bestS = a.s + tNorm
      const nx = -uy
      const ny = ux
      bestT = px * nx + py * ny
      bestHdg = Math.atan2(uy, ux)
      bestClamped = clamped
    }
  }
  return { s: bestS, t: bestT, hdg: bestHdg, distance: bestDist, clampedAtEnd: bestClamped }
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
  dynamic: 'yes' | 'no'
  orientation: '+' | '-'
  /** Lane range the signal applies to (regulatory layer); omitted = whole road. */
  validity?: { fromLane: number; toLane: number }
  /**
   * Stop line polyline in ENU meters, carried as <userData code="stopLine">
   * so the importer can rebuild the stop-line linestring and re-link it.
   */
  stopLinePoints?: { x: number; y: number }[]
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
  crosswalks: CrosswalkShape[],
  polygons: { shape: PolygonShape; vertices: { x: number; y: number }[] }[],
  laneToGeom: Map<string, RoadGeometry>,
  laneIdToRoadId: Map<string, number>,
  maxAttachDistanceMeter: number = 50
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
  let signalIdCounter = 1
  let objectIdCounter = 1

  const roads: { laneId: string; geom: RoadGeometry; roadId: number }[] = []
  laneToGeom.forEach((geom, laneId) => {
    const roadId = laneIdToRoadId.get(laneId)
    if (roadId !== undefined) roads.push({ laneId, geom, roadId })
  })
  const geomByRoadId = new Map<number, RoadGeometry>()
  for (const r of roads) geomByRoadId.set(r.roadId, r.geom)

  for (const tl of trafficLights) {
    const xG = pxToEnuX(tl.x)
    const yG = pxToEnuY(tl.y)

    // Regulatory layer: a signal that names affected lanes attaches to the
    // nearest of those lanes' roads and carries a <validity> record for the
    // road's single driving lane (-1). Distance gating does not apply — the
    // assignment is explicit.
    const affectedRoadIds = new Set<number>()
    for (const laneShapeId of tl.props.affectedLaneIds ?? []) {
      const rid = laneIdToRoadId.get(laneShapeId)
      if (rid !== undefined) affectedRoadIds.add(rid)
    }
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    if (affectedRoadIds.size > 0) {
      for (const r of roads) {
        if (!affectedRoadIds.has(r.roadId)) continue
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
    const style = tl.props.style ?? ''
    const isPed = style.startsWith('pedestrian') || style.includes('ped')
    // Conventional signal type codes: 1000001 = vehicle, 1000002 = pedestrian.
    const sigType = isPed ? '1000002' : '1000001'
    const heightM = pxToMeter(tl.props.h)
    const widthM = pxToMeter(tl.props.w)
    const list = roadSignals.get(best.roadId) ?? []
    const entry: SignalEntry = {
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
    if (affectedRoadIds.size > 0) {
      // The exporter emits one driving lane (-1) per road.
      entry.validity = { fromLane: -1, toLane: -1 }
    }
    list.push(entry)
    roadSignals.set(best.roadId, list)
    signalIdByShape.set(tl.id, entry.id)

    // A signal controlling several lanes spans several roads in the
    // 1-lane-per-road model. The remaining affected roads get a standard
    // <signalReference> pointing back at the signal so the validity links
    // survive a round trip (and ODR consumers see the full coverage).
    if (affectedRoadIds.size > 1) {
      for (const r of roads) {
        if (r.roadId === best.roadId || !affectedRoadIds.has(r.roadId)) continue
        const proj = projectToRoad(r.geom, xG, yG)
        const refs = roadSignalRefs.get(r.roadId) ?? []
        refs.push({
          id: entry.id,
          s: proj.s,
          t: proj.t,
          orientation: proj.t >= 0 ? '+' : '-',
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
    const affectedRoadIds = new Set<number>()
    for (const laneShapeId of cw.props.affectedLaneIds ?? []) {
      const rid = laneIdToRoadId.get(laneShapeId)
      if (rid !== undefined) affectedRoadIds.add(rid)
    }
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    if (affectedRoadIds.size > 0) {
      for (const r of roads) {
        if (!affectedRoadIds.has(r.roadId)) continue
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
    // Regulatory links (affected roads + stop line polyline) ride along as
    // <userData> — OpenDRIVE's standard extension mechanism — so they survive
    // an .xodr round trip. Coordinates are ENU meters.
    const userData: { code: string; value: string }[] = []
    if (affectedRoadIds.size > 0) {
      const links: { affectedRoads: string[]; stopLine?: number[][] } = {
        affectedRoads: [...affectedRoadIds].sort((a, b) => a - b).map(String),
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
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    let fallback: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    for (const r of roads) {
      const proj = projectToRoad(r.geom, xG, yG)
      if (proj.clampedAtEnd) {
        if (!fallback || proj.distance < fallback.proj.distance) fallback = { roadId: r.roadId, proj }
        continue
      }
      if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
    }
    if (!best) best = fallback
    if (!best || best.proj.distance > maxAttachDistanceMeter) continue
    const cosH = Math.cos(best.proj.hdg)
    const sinH = Math.sin(best.proj.hdg)
    const samples = laneToGeom.get([...laneToGeom.keys()].find((k) => laneIdToRoadId.get(k) === best!.roadId)!)!.odrSamples
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
    const attrs = `id="${s.id}" s="${fmt(s.s)}" t="${fmt(s.t)}" zOffset="${fmt(s.zOffset)}" name="${escapeXml(s.name)}" dynamic="${s.dynamic}" orientation="${s.orientation}" type="${s.type}" subtype="${s.subtype}" country="OpenDRIVE" value="0" height="${fmt(s.height)}" width="${fmt(s.width)}"`
    if (s.validity || s.stopLinePoints) {
      lines.push(`      <signal ${attrs}>`)
      if (s.validity) {
        lines.push(
          `        <validity fromLane="${s.validity.fromLane}" toLane="${s.validity.toLane}"/>`
        )
      }
      if (s.stopLinePoints) {
        const json = JSON.stringify(
          s.stopLinePoints.map((p) => [roundMm(p.x), roundMm(p.y)])
        )
        lines.push(`        <userData code="stopLine" value="${escapeXml(json)}"/>`)
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
    lines.push(`        <validity fromLane="-1" toLane="-1"/>`)
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
 * all) are stashed verbatim as JSON in <userData code="laneAttributes"> —
 * OpenDRIVE's standard extension mechanism — and restored by the importer.
 * `odr_*` meta attributes are excluded: they are regenerated on import.
 */
function emitLaneAttributesUserData(lane: LaneShape): string | null {
  const stash: Record<string, string> = {}
  for (const [k, v] of Object.entries(lane.props.attributes ?? {})) {
    if (k === 'type' || k.startsWith('odr_')) continue
    if (v === undefined || v === null || v === '') continue
    stash[k] = String(v)
  }
  if (Object.keys(stash).length === 0) return null
  return `    <userData code="laneAttributes" value="${escapeXml(JSON.stringify(stash))}"/>`
}

/**
 * Right-of-way links (`yieldLaneIds`) have no canonical OpenDRIVE road-level
 * representation in this exporter (junction <priority> mapping is out of
 * scope), so the yielding lanes' road ids are stashed in
 * <userData code="yieldRoads"> and restored by the importer.
 */
function emitYieldRoadsUserData(lane: LaneShape, laneIdToRoadId: Map<string, number>): string | null {
  const yieldRoadIds: number[] = []
  for (const yieldShapeId of lane.props.yieldLaneIds ?? []) {
    const rid = laneIdToRoadId.get(yieldShapeId)
    if (rid !== undefined && !yieldRoadIds.includes(rid)) yieldRoadIds.push(rid)
  }
  if (yieldRoadIds.length === 0) return null
  const json = JSON.stringify(yieldRoadIds.sort((a, b) => a - b).map(String))
  return `    <userData code="yieldRoads" value="${escapeXml(json)}"/>`
}


/**
 * Road length attribute. The plan-view geometries are emitted with rounded
 * (6-decimal) s/length values whose cumulative extent can exceed the exact
 * road length by ~1e-6, which strict consumers flag as "s too large". Use the
 * emitted extent plus a tiny pad so the length always covers the geometry.
 */
function emittedRoadLength(geom: RoadGeometry): number {
  let extent = geom.length
  for (let i = 0; i < geom.odrSamples.length - 1; i++) {
    const a = geom.odrSamples[i]
    const b = geom.odrSamples[i + 1]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    if (segLen < 1e-9) continue
    const end = parseFloat(fmt(a.s)) + parseFloat(fmt(segLen))
    if (end > extent) extent = end
  }
  return extent + 1e-4
}

function emitRoad(
  lane: LaneShape,
  geom: RoadGeometry,
  roadId: number,
  laneIdToRoadId: Map<string, number>,
  junctionPlan: JunctionPlan,
  signals: SignalEntry[],
  signalRefs: SignalReferenceEntry[],
  objects: ObjectEntry[],
  shapeMap: Map<string, BaseShape>
): string {
  const speed = lane.props.attributes?.speed_limit
  const name = escapeXml(lane.props.attributes?.subtype || 'road')
  const hasPrev = (lane.props.prev ?? []).some((id) => laneIdToRoadId.has(id))
  const hasNext = (lane.props.next ?? []).some((id) => laneIdToRoadId.has(id))
  const junctionAttr = junctionPlan.roadJunction.get(lane.id) ?? -1
  const lines: string[] = []
  lines.push(
    `  <road name="${name}" length="${fmt(emittedRoadLength(geom))}" id="${roadId}" junction="${junctionAttr}">`
  )
  lines.push(emitLink(lane, laneIdToRoadId, junctionPlan))
  if (speed) {
    lines.push(`    <type s="0" type="town">`)
    lines.push(`      <speed max="${escapeXml(speed)}" unit="km/h"/>`)
    lines.push(`    </type>`)
  }
  lines.push(emitPlanView(geom))
  lines.push(`    <elevationProfile/>`)
  lines.push(`    <lateralProfile/>`)
  lines.push(
    emitLanes(
      geom,
      hasPrev,
      hasNext,
      odrLaneTypeFor(lane),
      roadMarkTypeFor(shapeMap, lane.props.leftBoundaryId),
      roadMarkTypeFor(shapeMap, lane.props.rightBoundaryId)
    )
  )
  lines.push(emitObjects(objects))
  lines.push(emitSignals(signals, signalRefs))
  const userData = emitLaneAttributesUserData(lane)
  if (userData) lines.push(userData)
  const yieldUserData = emitYieldRoadsUserData(lane, laneIdToRoadId)
  if (yieldUserData) lines.push(yieldUserData)
  lines.push(`  </road>`)
  return lines.join('\n')
}

/**
 * Build an OpenDRIVE 1.8 XML document from a snapshot.
 */
export function exportToOpenDrive(snapshot: DrawtonomySnapshot): string {
  const shapes = snapshot.shapes
  const shapeMap = buildShapeMap(shapes)
  const lanes: LaneShape[] = []
  const trafficLights: TrafficLightShape[] = []
  const crosswalks: CrosswalkShape[] = []
  const polygons: { shape: PolygonShape; vertices: { x: number; y: number }[] }[] = []
  for (const s of shapes) {
    if (s.type === 'lane') lanes.push(s as unknown as LaneShape)
    else if (s.type === 'traffic_light') trafficLights.push(s as unknown as TrafficLightShape)
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

  // Road ids are assigned after geometry construction so degenerate lanes
  // (zero-length centerlines) neither emit empty roads nor occupy link ids.
  const laneIdToRoadId = new Map<string, number>()

  const dateStr = new Date().toISOString()
  const bbox = computeEnuBoundingBox(shapeMap)
  const geoRefProj = originToProjString(snapshot.origin)
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<OpenDRIVE>`)
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

  const pointOverrides = buildBoundaryAlignmentOverrides(shapeMap, lanes)

  const laneToGeom = new Map<string, RoadGeometry>()
  for (const lane of lanes) {
    const geom = buildRoadGeometry(shapeMap, lane, pointOverrides)
    if (geom && geom.length >= 0.01 && geom.odrSamples.length >= 2) {
      laneToGeom.set(lane.id, geom)
    }
  }
  let nextRoadId = 1
  for (const lane of lanes) {
    if (laneToGeom.has(lane.id)) laneIdToRoadId.set(lane.id, nextRoadId++)
  }
  const junctionPlan = planJunctions(lanes, laneIdToRoadId, nextRoadId)
  const { roadSignals, roadObjects, roadSignalRefs, signalIdByShape } = attachShapesToRoads(
    shapeMap,
    trafficLights,
    crosswalks,
    polygons,
    laneToGeom,
    laneIdToRoadId
  )

  for (const lane of lanes) {
    const geom = laneToGeom.get(lane.id)
    if (!geom) continue
    const roadId = laneIdToRoadId.get(lane.id)!
    const signals = roadSignals.get(roadId) ?? []
    const signalRefs = roadSignalRefs.get(roadId) ?? []
    const objects = roadObjects.get(roadId) ?? []
    lines.push(
      emitRoad(lane, geom, roadId, laneIdToRoadId, junctionPlan, signals, signalRefs, objects, shapeMap)
    )
  }

  // Signal groups: traffic lights sharing a controllerId (one intersection)
  // become a <controller> listing their emitted signals as <control> records.
  const controllerGroups = new Map<string, number[]>()
  for (const tl of trafficLights) {
    const groupId = tl.props.controllerId
    if (!groupId) continue
    const signalId = signalIdByShape.get(tl.id)
    if (signalId === undefined) continue
    const group = controllerGroups.get(groupId) ?? []
    group.push(signalId)
    controllerGroups.set(groupId, group)
  }
  let controllerIdCounter = 1
  for (const [groupId, signalIds] of controllerGroups) {
    lines.push(`  <controller id="${controllerIdCounter++}" name="${escapeXml(groupId)}" sequence="0">`)
    for (const signalId of signalIds) {
      lines.push(`    <control signalId="${signalId}" type="0"/>`)
    }
    lines.push(`  </controller>`)
  }

  // Synthesized junctions for branch / merge connectivity (see planJunctions).
  for (const junction of junctionPlan.junctions) {
    lines.push(`  <junction id="${junction.id}" name="junction${junction.id}">`)
    junction.connections.forEach((conn, idx) => {
      lines.push(
        `    <connection id="${idx}" incomingRoad="${conn.incoming}" connectingRoad="${conn.connecting}" contactPoint="start">`
      )
      lines.push(`      <laneLink from="-1" to="-1"/>`)
      lines.push(`    </connection>`)
    })
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
