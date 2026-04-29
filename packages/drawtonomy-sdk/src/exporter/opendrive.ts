// OpenDRIVE 1.8 (.xodr) exporter — emits a road network from a snapshot.
// No external library dependencies.
//
// Design (Phase 1):
// - Each lane is emitted as an independent <road> (junctions are out of scope)
// - Reference line is the midpoints of the left/right boundary samples
// - Each segment is a <line> geometry; lane width is a per-sample <width>
// - Lane connectivity (next/prev) is written into <link>
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
  type Endpoint = { pointId: string; x: number; y: number }
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
      endpoints.push({ pointId: pid, x: pt.x, y: pt.y })
    }
  }

  // Restrict to lanes that participate in a next/prev relationship.
  for (const lane of lanes) {
    const hasNext = (lane.props.next || []).some((id) => laneIds.has(id))
    const hasPrev = (lane.props.prev || []).some((id) => laneIds.has(id))
    if (hasNext) collectEndpoints(lane, 'end')
    if (hasPrev) collectEndpoints(lane, 'start')
  }

  // Greedy clustering: group points within epsilon of each other.
  const clusters: Endpoint[][] = []
  const eps2 = epsilonPx * epsilonPx
  for (const ep of endpoints) {
    let placed = false
    for (const cluster of clusters) {
      const c0 = cluster[0]
      const dx = ep.x - c0.x
      const dy = ep.y - c0.y
      if (dx * dx + dy * dy <= eps2) {
        cluster.push(ep)
        placed = true
        break
      }
    }
    if (!placed) clusters.push([ep])
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

function emitLanes(geom: RoadGeometry, hasPrev: boolean, hasNext: boolean): string {
  const lines: string[] = []
  lines.push(`    <lanes>`)
  lines.push(`      <laneSection s="0">`)
  // Left side: id=+1 (OpenDRIVE numbers lanes positively to the left of the reference line).
  lines.push(`        <left>`)
  lines.push(`          <lane id="1" type="driving" level="false">`)
  emitLaneLink(lines, hasPrev, hasNext, 1)
  emitHalfWidthEntries(geom, lines)
  lines.push(`            <roadMark sOffset="0" type="solid" weight="standard" color="white" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </left>`)
  // Center reference line.
  lines.push(`        <center>`)
  lines.push(`          <lane id="0" type="none" level="false">`)
  lines.push(`            <link/>`)
  lines.push(`            <roadMark sOffset="0" type="solid" weight="standard" color="standard" width="0.13"/>`)
  lines.push(`          </lane>`)
  lines.push(`        </center>`)
  // Right side: id=-1.
  lines.push(`        <right>`)
  lines.push(`          <lane id="-1" type="driving" level="false">`)
  emitLaneLink(lines, hasPrev, hasNext, -1)
  emitHalfWidthEntries(geom, lines)
  lines.push(`            <roadMark sOffset="0" type="solid" weight="standard" color="white" width="0.13"/>`)
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

function emitHalfWidthEntries(geom: RoadGeometry, out: string[]): void {
  for (let i = 0; i < geom.odrSamples.length - 1; i++) {
    const s = geom.odrSamples[i].s
    const halfA = geom.odrSamples[i].width / 2
    const halfB = geom.odrSamples[i + 1].width / 2
    const segLen = geom.odrSamples[i + 1].s - s
    // Linear fit a + b*ds (c=d=0).
    const a = halfA
    const b = segLen > 1e-9 ? (halfB - halfA) / segLen : 0
    out.push(`            <width sOffset="${fmt(s)}" a="${fmt(a)}" b="${fmt(b)}" c="0" d="0"/>`)
  }
}

function emitLink(lane: LaneShape, laneIdToRoadId: Map<string, number>): string {
  const lines: string[] = []
  lines.push(`    <link>`)
  if (lane.props.prev?.[0] && laneIdToRoadId.has(lane.props.prev[0])) {
    const rid = laneIdToRoadId.get(lane.props.prev[0])!
    lines.push(`      <predecessor elementType="road" elementId="${rid}" contactPoint="end"/>`)
  }
  if (lane.props.next?.[0] && laneIdToRoadId.has(lane.props.next[0])) {
    const rid = laneIdToRoadId.get(lane.props.next[0])!
    lines.push(`      <successor elementType="road" elementId="${rid}" contactPoint="start"/>`)
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
}

function attachShapesToRoads(
  trafficLights: TrafficLightShape[],
  crosswalks: CrosswalkShape[],
  polygons: { shape: PolygonShape; vertices: { x: number; y: number }[] }[],
  laneToGeom: Map<string, RoadGeometry>,
  laneIdToRoadId: Map<string, number>,
  maxAttachDistanceMeter: number = 50
): {
  roadSignals: Map<number, SignalEntry[]>
  roadObjects: Map<number, ObjectEntry[]>
} {
  const roadSignals = new Map<number, SignalEntry[]>()
  const roadObjects = new Map<number, ObjectEntry[]>()
  let signalIdCounter = 1
  let objectIdCounter = 1

  const roads: { laneId: string; geom: RoadGeometry; roadId: number }[] = []
  laneToGeom.forEach((geom, laneId) => {
    const roadId = laneIdToRoadId.get(laneId)
    if (roadId !== undefined) roads.push({ laneId, geom, roadId })
  })

  for (const tl of trafficLights) {
    const xG = pxToEnuX(tl.x)
    const yG = pxToEnuY(tl.y)
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    for (const r of roads) {
      const proj = projectToRoad(r.geom, xG, yG)
      if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
    }
    if (!best || best.proj.distance > maxAttachDistanceMeter) continue
    const style = tl.props.style ?? ''
    const isPed = style.startsWith('pedestrian') || style.includes('ped')
    // Conventional signal type codes: 1000001 = vehicle, 1000002 = pedestrian.
    const sigType = isPed ? '1000002' : '1000001'
    const heightM = pxToMeter(tl.props.h)
    const widthM = pxToMeter(tl.props.w)
    const list = roadSignals.get(best.roadId) ?? []
    list.push({
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
    })
    roadSignals.set(best.roadId, list)
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
    let best: { roadId: number; proj: ReturnType<typeof projectToRoad> } | null = null
    for (const r of roads) {
      const proj = projectToRoad(r.geom, xG, yG)
      if (!best || proj.distance < best.proj.distance) best = { roadId: r.roadId, proj }
    }
    if (!best || best.proj.distance > maxAttachDistanceMeter) continue
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

  return { roadSignals, roadObjects }
}

function emitSignals(signals: SignalEntry[]): string {
  if (!signals.length) return `    <signals/>`
  const lines: string[] = []
  lines.push(`    <signals>`)
  for (const s of signals) {
    lines.push(
      `      <signal id="${s.id}" s="${fmt(s.s)}" t="${fmt(s.t)}" zOffset="${fmt(s.zOffset)}" name="${escapeXml(s.name)}" dynamic="${s.dynamic}" orientation="${s.orientation}" type="${s.type}" subtype="${s.subtype}" country="OpenDRIVE" value="0" height="${fmt(s.height)}" width="${fmt(s.width)}"/>`
    )
  }
  lines.push(`    </signals>`)
  return lines.join('\n')
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
      lines.push(
        `      <object id="${o.id}" s="${fmt(o.s)}" t="${fmt(o.t)}" zOffset="${fmt(o.zOffset)}" hdg="${fmt(o.hdg)}" name="${escapeXml(o.name)}" type="${o.type}" orientation="${o.orientation}" length="${fmt(o.length)}" width="${fmt(o.width)}" height="${fmt(o.height)}"/>`
      )
    }
  }
  lines.push(`    </objects>`)
  return lines.join('\n')
}

function emitRoad(
  lane: LaneShape,
  geom: RoadGeometry,
  roadId: number,
  laneIdToRoadId: Map<string, number>,
  signals: SignalEntry[],
  objects: ObjectEntry[]
): string {
  const speed = lane.props.attributes?.speed_limit
  const name = escapeXml(lane.props.attributes?.subtype || 'road')
  const hasPrev = !!(lane.props.prev?.[0] && laneIdToRoadId.has(lane.props.prev[0]))
  const hasNext = !!(lane.props.next?.[0] && laneIdToRoadId.has(lane.props.next[0]))
  const lines: string[] = []
  lines.push(
    `  <road name="${name}" length="${fmt(geom.length)}" id="${roadId}" junction="-1">`
  )
  lines.push(emitLink(lane, laneIdToRoadId))
  if (speed) {
    lines.push(`    <type s="0" type="town">`)
    lines.push(`      <speed max="${escapeXml(speed)}" unit="km/h"/>`)
    lines.push(`    </type>`)
  }
  lines.push(emitPlanView(geom))
  lines.push(`    <elevationProfile/>`)
  lines.push(`    <lateralProfile/>`)
  lines.push(emitLanes(geom, hasPrev, hasNext))
  lines.push(emitObjects(objects))
  lines.push(emitSignals(signals))
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

  // Assign sequential road ids.
  const laneIdToRoadId = new Map<string, number>()
  lanes.forEach((lane, i) => laneIdToRoadId.set(lane.id, i + 1))

  const dateStr = new Date().toISOString()
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<OpenDRIVE>`)
  lines.push(
    `  <header revMajor="1" revMinor="8" name="drawtonomy" version="1.0" date="${dateStr}" north="0" south="0" east="0" west="0" vendor="drawtonomy"/>`
  )

  const pointOverrides = buildBoundaryAlignmentOverrides(shapeMap, lanes)

  const laneToGeom = new Map<string, RoadGeometry>()
  for (const lane of lanes) {
    const geom = buildRoadGeometry(shapeMap, lane, pointOverrides)
    if (geom) laneToGeom.set(lane.id, geom)
  }
  const { roadSignals, roadObjects } = attachShapesToRoads(
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
    const objects = roadObjects.get(roadId) ?? []
    lines.push(emitRoad(lane, geom, roadId, laneIdToRoadId, signals, objects))
  }

  lines.push(`</OpenDRIVE>`)
  return lines.join('\n')
}
