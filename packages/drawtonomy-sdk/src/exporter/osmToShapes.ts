// Convert parsed Lanelet2 OSM data into the shape primitives that the
// drawtonomy editor consumes (points, linestrings, lanes, traffic lights,
// crosswalks). right_of_way regulatory elements are restored as lane-level
// `yieldLaneIds` props rather than standalone shapes.
//
// The output is the intermediate `ImportedShapes` structure used by the
// editor's import flow — not a full DrawtonomySnapshot — because the editor
// needs per-shape positioning + bounds to drive its chunked import (camera
// alignment, progress reporting, etc.). Callers can wrap the result into
// shapes themselves.

import type { ShapeId } from '../types'
import { latLonToCanvas, type OsmData } from './osmParser'

/**
 * ID allocator interface. The default implementation produces predictable
 * `shape:<kind>_<n>` ids starting from 0; callers (e.g. the editor) can pass
 * a custom allocator to coordinate IDs with their own counters.
 */
export interface ShapeIdAllocator {
  next(kind: 'point' | 'linestring' | 'lane' | 'traffic_light' | 'crosswalk'): ShapeId
}

/** Default allocator: monotonic counter per shape kind. */
export function createShapeIdAllocator(): ShapeIdAllocator {
  const counters: Record<string, number> = { point: 0, linestring: 0, lane: 0, traffic_light: 0, crosswalk: 0 }
  return {
    next(kind) {
      const id = `shape:${kind}_${counters[kind]}` as ShapeId
      counters[kind] += 1
      return id
    },
  }
}

export interface ImportedPoint {
  id: ShapeId
  x: number
  y: number
  osmId: string
}

export interface ImportedLinestring {
  id: ShapeId
  x: number
  y: number
  pointIds: string[]
  osmId: string
  attributes: Record<string, string>
}

export interface ImportedLane {
  id: ShapeId
  x: number
  y: number
  leftBoundaryId: string
  rightBoundaryId: string
  /**
   * Whether the boundary's node order should be reversed when interpreted by
   * the editor. Lanelet2 encodes lane direction via the left boundary's node
   * order, but a sibling lane in the opposite direction may share the same
   * boundary read backwards.
   */
  invertLeft: boolean
  invertRight: boolean
  osmId: string
  attributes: Record<string, string>
  next: string[]
  prev: string[]
  /**
   * Imported lane shape ids that must yield to this lane, restored from a
   * `right_of_way` regulatory element where this lane plays the
   * "right_of_way" role.
   */
  yieldLaneIds?: string[]
}

export interface ImportedTrafficLight {
  id: ShapeId
  /** Canvas position (midpoint of the "refers" way). */
  x: number
  y: number
  /** Signal width in canvas pixels (span of the "refers" way). */
  w: number
  /** Signal height in canvas pixels (not encoded in the source; 2:1 aspect default). */
  h: number
  /** OSM id of the regulatory_element relation ('' for non-OSM sources). */
  osmId: string
  /** Imported lane shape ids whose lanelet relations reference this regulatory element. */
  affectedLaneIds: string[]
  /** Imported linestring shape id of the "ref_line" stop line, or null. */
  stopLineId: string | null
  attributes: Record<string, string>
}

export interface ImportedCrosswalk {
  id: ShapeId
  /** Canvas position (midpoint of the crosswalk axis). */
  x: number
  y: number
  /** Crosswalk axis start/end in shape-local coordinates (rotation 0). */
  startX: number
  startY: number
  endX: number
  endY: number
  /** Stripe band thickness across the road (canvas pixels). */
  crosswalkWidth: number
  /** OSM id of the regulatory_element relation ('' for non-OSM sources). */
  osmId: string
  /** Imported lane shape ids whose lanelet relations reference this regulatory element. */
  affectedLaneIds: string[]
  /** Imported linestring shape id of the "ref_line" stop line, or null. */
  stopLineId: string | null
  attributes: Record<string, string>
}

export interface ImportBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  centerX: number
  centerY: number
  width: number
  height: number
}

export interface ImportedShapes {
  points: ImportedPoint[]
  linestrings: ImportedLinestring[]
  lanes: ImportedLane[]
  /** Traffic lights promoted from regulatory elements / signals. */
  trafficLights: ImportedTrafficLight[]
  /** Crosswalks promoted from `crosswalk` regulatory elements / objects. */
  crosswalks: ImportedCrosswalk[]
  bounds: ImportBounds
  /**
   * Geographic center used as the canvas origin during projection. The host
   * app should call `setMapOrigin(originLatLon)` so that the map background
   * lines up with the imported lanes at page (0, 0).
   */
  originLatLon?: { lat: number; lon: number }
}

export interface OsmToShapesOptions {
  /** Custom id allocator. A fresh `createShapeIdAllocator()` is used when omitted. */
  idAllocator?: ShapeIdAllocator
  /**
   * Restrict conversion to the given lanelet relation IDs. When omitted, all
   * `type=lanelet` relations are converted. Traffic light / crosswalk /
   * right_of_way regulatory elements are promoted to editable shapes or lane
   * props (restricted to the selected lanelets when a selection is given);
   * other relation types are preserved via the sidecar.
   */
  selectedLaneIds?: readonly string[]
}

interface Point2d {
  x: number
  y: number
}

function getMiddlePoint(points: Point2d[]): Point2d {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    }
  }
  return points[Math.floor(points.length / 2)]
}

/**
 * Decide whether to reverse the left and/or right boundary so the lane is
 * interpreted consistently by the editor.
 *
 * In Lanelet2, the way's node order defines the lane direction (the left
 * boundary's direction is the lane's direction). This routine preserves that
 * direction whenever possible, only flipping a boundary when needed to keep
 * the right-of-left invariant.
 */
export function alignBoundaries(
  leftPoints: Point2d[],
  rightPoints: Point2d[]
): { invertLeft: boolean; invertRight: boolean } {
  if (leftPoints.length < 2 || rightPoints.length < 2) {
    return { invertLeft: false, invertRight: false }
  }

  const getEffective = (points: Point2d[], invert: boolean) =>
    invert ? [...points].reverse() : points

  const areParallel = (left: Point2d[], right: Point2d[]) => {
    const ls = left[0], le = left[left.length - 1]
    const rs = right[0], re = right[right.length - 1]
    const parallelDist = Math.hypot(ls.x - rs.x, ls.y - rs.y) + Math.hypot(le.x - re.x, le.y - re.y)
    const crossDist = Math.hypot(ls.x - re.x, ls.y - re.y) + Math.hypot(le.x - rs.x, le.y - rs.y)
    return parallelDist <= crossDist
  }

  const isRightOnRightSide = (left: Point2d[], right: Point2d[]) => {
    if (left.length < 2 || right.length < 1) return false

    const leftDir = {
      x: left[left.length - 1].x - left[0].x,
      y: left[left.length - 1].y - left[0].y,
    }

    const leftMid = getMiddlePoint(left)
    const rightMid = getMiddlePoint(right)

    const leftToRight = {
      x: rightMid.x - leftMid.x,
      y: rightMid.y - leftMid.y,
    }

    // Cross product. In screen coordinates (Y points down), the sign is
    // inverted vs. standard math convention; positive means "right is on the
    // right of left".
    const cross = leftDir.x * leftToRight.y - leftDir.y * leftToRight.x

    if (Math.abs(cross) < 1e-6) {
      // Converging boundaries: fall back to comparing start-to-start.
      const leftToRightStart = {
        x: right[0].x - left[0].x,
        y: right[0].y - left[0].y,
      }
      const crossStart = leftDir.x * leftToRightStart.y - leftDir.y * leftToRightStart.x
      return crossStart > 0
    }

    return cross > 0
  }

  if (areParallel(leftPoints, rightPoints) && isRightOnRightSide(leftPoints, rightPoints)) {
    return { invertLeft: false, invertRight: false }
  }

  const rightInverted = getEffective(rightPoints, true)
  if (areParallel(leftPoints, rightInverted) && isRightOnRightSide(leftPoints, rightInverted)) {
    return { invertLeft: false, invertRight: true }
  }

  const leftInverted = getEffective(leftPoints, true)
  if (areParallel(leftInverted, rightPoints) && isRightOnRightSide(leftInverted, rightPoints)) {
    return { invertLeft: true, invertRight: false }
  }

  if (areParallel(leftInverted, rightInverted) && isRightOnRightSide(leftInverted, rightInverted)) {
    return { invertLeft: true, invertRight: true }
  }

  if (areParallel(leftPoints, rightPoints)) {
    return { invertLeft: false, invertRight: false }
  }
  if (areParallel(leftPoints, rightInverted)) {
    return { invertLeft: false, invertRight: true }
  }

  return { invertLeft: false, invertRight: false }
}

interface LaneInfo {
  osmId: string
  laneId: ShapeId
  leftWayId: string
  rightWayId: string
  leftFirstNode: string
  leftLastNode: string
  rightFirstNode: string
  rightLastNode: string
  invertLeft: boolean
  invertRight: boolean
}

/**
 * Detect lane connectivity (next/prev) by matching the boundary endpoints of
 * one lane to the start of another. Runs in O(n) using start/end node hash
 * maps.
 */
function detectLaneConnections(
  laneInfos: LaneInfo[]
): Map<string, { next: string[]; prev: string[] }> {
  const connections = new Map<string, { next: string[]; prev: string[] }>()
  laneInfos.forEach(info => {
    connections.set(info.laneId, { next: [], prev: [] })
  })

  const getEffectiveNodes = (lane: LaneInfo) => {
    const leftStart = lane.invertLeft ? lane.leftLastNode : lane.leftFirstNode
    const leftEnd = lane.invertLeft ? lane.leftFirstNode : lane.leftLastNode
    const rightStart = lane.invertRight ? lane.rightLastNode : lane.rightFirstNode
    const rightEnd = lane.invertRight ? lane.rightFirstNode : lane.rightLastNode
    return { leftStart, leftEnd, rightStart, rightEnd }
  }

  const startNodeMap = new Map<string, ShapeId[]>()
  const endNodeMap = new Map<string, ShapeId[]>()

  for (const lane of laneInfos) {
    const nodes = getEffectiveNodes(lane)
    const startKey = `${nodes.leftStart}|${nodes.rightStart}`
    const endKey = `${nodes.leftEnd}|${nodes.rightEnd}`
    if (!startNodeMap.has(startKey)) startNodeMap.set(startKey, [])
    startNodeMap.get(startKey)!.push(lane.laneId)
    if (!endNodeMap.has(endKey)) endNodeMap.set(endKey, [])
    endNodeMap.get(endKey)!.push(lane.laneId)
  }

  for (const lane of laneInfos) {
    const nodes = getEffectiveNodes(lane)
    const endKey = `${nodes.leftEnd}|${nodes.rightEnd}`
    const nextLaneIds = startNodeMap.get(endKey)
    if (!nextLaneIds) continue
    const conn = connections.get(lane.laneId)!
    for (const nextLaneId of nextLaneIds) {
      if (nextLaneId === lane.laneId) continue
      if (!conn.next.includes(nextLaneId)) {
        conn.next.push(nextLaneId)
        const nextConn = connections.get(nextLaneId)!
        if (!nextConn.prev.includes(lane.laneId)) {
          nextConn.prev.push(lane.laneId)
        }
      }
    }
  }

  return connections
}

function emptyBounds(): ImportBounds {
  return {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    centerX: 0,
    centerY: 0,
    width: 0,
    height: 0,
  }
}

/**
 * Convert parsed OSM data into editor-ready point/linestring/lane records.
 *
 * Pass `selectedLaneIds` to restrict to a subset of lanelet relations
 * (selective import); leave it `undefined` to import every `type=lanelet`
 * relation.
 */
export function osmToShapes(osmData: OsmData, options: OsmToShapesOptions = {}): ImportedShapes {
  const idAllocator = options.idAllocator ?? createShapeIdAllocator()
  const result: ImportedShapes = {
    points: [],
    linestrings: [],
    lanes: [],
    trafficLights: [],
    crosswalks: [],
    bounds: emptyBounds(),
  }

  // Compute the projection center.
  let minLat = Infinity, maxLat = -Infinity
  let minLon = Infinity, maxLon = -Infinity
  osmData.nodes.forEach(node => {
    if (node.lat < minLat) minLat = node.lat
    if (node.lat > maxLat) maxLat = node.lat
    if (node.lon < minLon) minLon = node.lon
    if (node.lon > maxLon) maxLon = node.lon
  })

  // For files emitted by drawtonomy, honor the embedded origin so page
  // coordinates round-trip exactly. Otherwise center on the bbox.
  const centerLat = osmData.drawtonomyOrigin?.lat ?? (minLat + maxLat) / 2
  const centerLon = osmData.drawtonomyOrigin?.lon ?? (minLon + maxLon) / 2
  result.originLatLon = { lat: centerLat, lon: centerLon }

  const osmNodeToPointId = new Map<string, ShapeId>()
  const osmWayToLinestringId = new Map<string, ShapeId>()
  const pointIdToPoint = new Map<string, ImportedPoint>()
  const linestringIdToLinestring = new Map<string, ImportedLinestring>()

  // Only `type=lanelet` relations become lanes. Traffic light regulatory
  // elements are promoted to traffic light shapes below; other relation types
  // (multipolygon, other regulatory elements, etc.) are preserved verbatim
  // via the OSM sidecar.
  let laneletRelations = osmData.relations.filter(r => r.tags.type === 'lanelet')
  if (options.selectedLaneIds) {
    const selected = new Set(options.selectedLaneIds)
    laneletRelations = laneletRelations.filter(r => selected.has(r.id))
  }

  // Traffic light / crosswalk / right_of_way regulatory elements to promote.
  // When a lanelet selection is active, only the elements referenced by the
  // selected lanelets come along.
  let trafficLightRelations = osmData.relations.filter(
    r => r.tags.type === 'regulatory_element' && r.tags.subtype === 'traffic_light'
  )
  let crosswalkRelations = osmData.relations.filter(
    r => r.tags.type === 'regulatory_element' && r.tags.subtype === 'crosswalk'
  )
  let rightOfWayRelations = osmData.relations.filter(
    r => r.tags.type === 'regulatory_element' && r.tags.subtype === 'right_of_way'
  )
  if (options.selectedLaneIds) {
    const referencedReIds = new Set<string>()
    for (const relation of laneletRelations) {
      for (const member of relation.members) {
        if (member.type === 'relation' && member.role === 'regulatory_element') {
          referencedReIds.add(member.ref)
        }
      }
    }
    trafficLightRelations = trafficLightRelations.filter(r => referencedReIds.has(r.id))
    crosswalkRelations = crosswalkRelations.filter(r => referencedReIds.has(r.id))
    rightOfWayRelations = rightOfWayRelations.filter(r => referencedReIds.has(r.id))
  }

  // A `subtype=crosswalk` lanelet that is the "refers" of a promoted crosswalk
  // regulatory element is consumed into the crosswalk shape — it must not also
  // materialize as a lane (no duplication).
  const crosswalkLaneletIds = new Set<string>()
  for (const re of crosswalkRelations) {
    for (const member of re.members) {
      if (member.type === 'relation' && member.role === 'refers') {
        const lanelet = osmData.relations.find(r => r.id === member.ref)
        if (lanelet && lanelet.tags.type === 'lanelet') crosswalkLaneletIds.add(member.ref)
      }
    }
  }
  laneletRelations = laneletRelations.filter(r => !crosswalkLaneletIds.has(r.id))

  // Collect ways and nodes referenced by the chosen lanelets.
  const usedWayIds = new Set<string>()
  const usedNodeIds = new Set<string>()
  for (const relation of laneletRelations) {
    for (const member of relation.members) {
      if (member.type === 'way') usedWayIds.add(member.ref)
    }
  }
  // Stop line ("ref_line") ways become linestrings too even though they are
  // not lane boundaries; "refers" ways are consumed into the traffic light
  // shape itself and stay sidecar-only.
  const refLineWayIds = new Set<string>()
  for (const re of [...trafficLightRelations, ...crosswalkRelations]) {
    for (const member of re.members) {
      if (member.type === 'way' && member.role === 'ref_line' && osmData.ways.has(member.ref)) {
        refLineWayIds.add(member.ref)
        usedWayIds.add(member.ref)
      }
    }
  }
  for (const wayId of usedWayIds) {
    const way = osmData.ways.get(wayId)
    if (!way) continue
    for (const ref of way.nodeRefs) usedNodeIds.add(ref)
  }

  // Materialize points (one per OSM node, shared across boundaries).
  for (const nodeId of usedNodeIds) {
    const node = osmData.nodes.get(nodeId)
    if (!node) continue
    const { x, y } = latLonToCanvas(node.lat, node.lon, centerLat, centerLon)
    const pointId = idAllocator.next('point')
    osmNodeToPointId.set(nodeId, pointId)
    const data: ImportedPoint = { id: pointId, x, y, osmId: nodeId }
    result.points.push(data)
    pointIdToPoint.set(pointId, data)
  }

  // Materialize linestrings (one per used way).
  for (const wayId of usedWayIds) {
    const way = osmData.ways.get(wayId)
    if (!way) continue
    const pointIds: string[] = []
    for (const nodeRef of way.nodeRefs) {
      const pid = osmNodeToPointId.get(nodeRef)
      if (pid) pointIds.push(pid)
    }
    if (pointIds.length < 2) continue

    const firstPoint = pointIdToPoint.get(pointIds[0])
    if (!firstPoint) continue

    const linestringId = idAllocator.next('linestring')
    osmWayToLinestringId.set(wayId, linestringId)
    const data: ImportedLinestring = {
      id: linestringId,
      x: firstPoint.x,
      y: firstPoint.y,
      pointIds,
      osmId: wayId,
      attributes: {
        type: way.tags.type || 'line_thin',
        subtype: way.tags.subtype || 'solid',
        width: way.tags.width || '0.2',
      },
    }
    result.linestrings.push(data)
    linestringIdToLinestring.set(linestringId, data)
  }

  // Stop line ways keep (or gain) the stop_line type so re-exports and the
  // editor recognize them; third-party files may leave the tag off.
  for (const wayId of refLineWayIds) {
    const lsId = osmWayToLinestringId.get(wayId)
    const ls = lsId ? linestringIdToLinestring.get(lsId) : undefined
    if (ls && ls.attributes.type !== 'stop_line') ls.attributes.type = 'stop_line'
  }

  // Materialize lanes and collect info for connectivity detection.
  const laneInfos: LaneInfo[] = []
  const laneShapeIdsByRegElem = new Map<string, string[]>()
  for (const relation of laneletRelations) {
    let leftWayId: string | null = null
    let rightWayId: string | null = null
    let leftBoundaryId: string | null = null
    let rightBoundaryId: string | null = null
    for (const member of relation.members) {
      if (member.type !== 'way') continue
      const linestringId = osmWayToLinestringId.get(member.ref)
      if (!linestringId) continue
      if (member.role === 'left') {
        leftBoundaryId = linestringId
        leftWayId = member.ref
      } else if (member.role === 'right') {
        rightBoundaryId = linestringId
        rightWayId = member.ref
      }
    }
    if (!leftBoundaryId || !rightBoundaryId || !leftWayId || !rightWayId) continue

    const leftWay = osmData.ways.get(leftWayId)
    const rightWay = osmData.ways.get(rightWayId)
    const leftLinestring = linestringIdToLinestring.get(leftBoundaryId)
    const rightLinestring = linestringIdToLinestring.get(rightBoundaryId)
    if (!leftWay || !rightWay || !leftLinestring || !rightLinestring) continue

    const getPointCoords = (pointIds: string[]): Point2d[] =>
      pointIds
        .map(pid => pointIdToPoint.get(pid))
        .filter((p): p is ImportedPoint => p !== undefined)
        .map(p => ({ x: p.x, y: p.y }))

    const { invertLeft, invertRight } = alignBoundaries(
      getPointCoords(leftLinestring.pointIds),
      getPointCoords(rightLinestring.pointIds)
    )

    const laneId = idAllocator.next('lane')
    for (const member of relation.members) {
      if (member.type === 'relation' && member.role === 'regulatory_element') {
        const list = laneShapeIdsByRegElem.get(member.ref) ?? []
        list.push(laneId)
        laneShapeIdsByRegElem.set(member.ref, list)
      }
    }
    laneInfos.push({
      osmId: relation.id,
      laneId,
      leftWayId,
      rightWayId,
      leftFirstNode: leftWay.nodeRefs[0],
      leftLastNode: leftWay.nodeRefs[leftWay.nodeRefs.length - 1],
      rightFirstNode: rightWay.nodeRefs[0],
      rightLastNode: rightWay.nodeRefs[rightWay.nodeRefs.length - 1],
      invertLeft,
      invertRight,
    })

    result.lanes.push({
      id: laneId,
      x: leftLinestring.x,
      y: leftLinestring.y,
      leftBoundaryId,
      rightBoundaryId,
      invertLeft,
      invertRight,
      osmId: relation.id,
      attributes: {
        // Unknown tags (e.g. odr_* source metadata) pass through verbatim so
        // they survive a Lanelet2 round-trip; the known keys keep their
        // defaults when absent.
        ...relation.tags,
        type: 'lanelet',
        subtype: relation.tags.subtype || 'road',
        location: relation.tags.location || 'urban',
        one_way: relation.tags.one_way || 'yes',
        speed_limit: relation.tags.speed_limit || '30',
        turn_direction: relation.tags.turn_direction || 'straight',
      },
      next: [],
      prev: [],
    })
  }

  const connections = detectLaneConnections(laneInfos)
  for (const lane of result.lanes) {
    const conn = connections.get(lane.id)
    if (conn) {
      lane.next = conn.next
      lane.prev = conn.prev
    }
  }

  // Materialize traffic lights from regulatory elements. The shape sits at
  // the midpoint of the "refers" way and spans its width; the way's OSM id is
  // kept in `refers_osm_id` so re-exports override the sidecar copy in place.
  for (const re of trafficLightRelations) {
    const refersMember = re.members.find(m => m.type === 'way' && m.role === 'refers')
    const refersWay = refersMember ? osmData.ways.get(refersMember.ref) : undefined
    if (!refersWay || refersWay.nodeRefs.length === 0) continue
    const coords: Point2d[] = []
    for (const ref of refersWay.nodeRefs) {
      const node = osmData.nodes.get(ref)
      if (node) coords.push(latLonToCanvas(node.lat, node.lon, centerLat, centerLon))
    }
    if (coords.length === 0) continue
    const first = coords[0]
    const last = coords[coords.length - 1]
    const span = Math.hypot(last.x - first.x, last.y - first.y)
    // The OSM encoding carries only the signal width; height keeps the
    // editor's default 1:2 aspect. Degenerate ways fall back to 30 px.
    const w = span > 1e-6 ? span : 30
    const refLineMember = re.members.find(m => m.type === 'way' && m.role === 'ref_line')
    const stopLineId = refLineMember ? osmWayToLinestringId.get(refLineMember.ref) ?? null : null
    result.trafficLights.push({
      id: idAllocator.next('traffic_light'),
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2,
      w,
      h: w * 2,
      osmId: re.id,
      affectedLaneIds: laneShapeIdsByRegElem.get(re.id) ?? [],
      stopLineId,
      attributes: { ...re.tags, refers_osm_id: refersWay.id },
    })
  }

  // Materialize crosswalks from regulatory elements. The shape geometry is
  // rebuilt from the "refers" crosswalk lanelet's left/right ways (axis along
  // the walking direction, band width = boundary separation); the consumed
  // lanelet / polygon / boundary way ids are kept in the attributes so
  // re-exports override the sidecar copies in place.
  const toCanvas = (nodeId: string): Point2d | null => {
    const node = osmData.nodes.get(nodeId)
    return node ? latLonToCanvas(node.lat, node.lon, centerLat, centerLon) : null
  }
  for (const re of crosswalkRelations) {
    const refersMember = re.members.find(m => m.type === 'relation' && m.role === 'refers')
    const lanelet = refersMember
      ? osmData.relations.find(r => r.id === refersMember.ref && r.tags.type === 'lanelet')
      : undefined
    if (!lanelet) continue
    const leftWayId = lanelet.members.find(m => m.type === 'way' && m.role === 'left')?.ref
    const rightWayId = lanelet.members.find(m => m.type === 'way' && m.role === 'right')?.ref
    const leftWay = leftWayId ? osmData.ways.get(leftWayId) : undefined
    const rightWay = rightWayId ? osmData.ways.get(rightWayId) : undefined
    if (!leftWay || !rightWay || leftWay.nodeRefs.length < 2 || rightWay.nodeRefs.length < 2) continue

    const l0 = toCanvas(leftWay.nodeRefs[0])
    const l1 = toCanvas(leftWay.nodeRefs[leftWay.nodeRefs.length - 1])
    let r0 = toCanvas(rightWay.nodeRefs[0])
    let r1 = toCanvas(rightWay.nodeRefs[rightWay.nodeRefs.length - 1])
    if (!l0 || !l1 || !r0 || !r1) continue
    // Pair the boundary endpoints so left/right run parallel (the right way
    // may be stored reversed).
    const dist = (a: Point2d, b: Point2d) => Math.hypot(a.x - b.x, a.y - b.y)
    if (dist(l0, r0) + dist(l1, r1) > dist(l0, r1) + dist(l1, r0)) {
      ;[r0, r1] = [r1, r0]
    }
    const start = { x: (l0.x + r0.x) / 2, y: (l0.y + r0.y) / 2 }
    const end = { x: (l1.x + r1.x) / 2, y: (l1.y + r1.y) / 2 }
    const width = (dist(l0, r0) + dist(l1, r1)) / 2
    const cx = (start.x + end.x) / 2
    const cy = (start.y + end.y) / 2

    const refLineMember = re.members.find(m => m.type === 'way' && m.role === 'ref_line')
    const stopLineId = refLineMember ? osmWayToLinestringId.get(refLineMember.ref) ?? null : null
    const polygonMember = re.members.find(m => m.type === 'way' && m.role === 'crosswalk_polygon')

    const attributes: Record<string, string> = {
      ...re.tags,
      crosswalk_lanelet_osm_id: lanelet.id,
      crosswalk_left_osm_id: leftWay.id,
      crosswalk_right_osm_id: rightWay.id,
    }
    if (polygonMember) attributes.crosswalk_polygon_osm_id = polygonMember.ref

    result.crosswalks.push({
      id: idAllocator.next('crosswalk'),
      x: cx,
      y: cy,
      startX: start.x - cx,
      startY: start.y - cy,
      endX: end.x - cx,
      endY: end.y - cy,
      crosswalkWidth: width,
      osmId: re.id,
      affectedLaneIds: laneShapeIdsByRegElem.get(re.id) ?? [],
      stopLineId,
      attributes,
    })
  }

  // Restore yieldLaneIds from right_of_way regulatory elements: each lanelet
  // playing the "right_of_way" role gains the materialized "yield" lanelets.
  const laneByOsmId = new Map<string, ImportedLane>()
  for (const lane of result.lanes) laneByOsmId.set(lane.osmId, lane)
  for (const re of rightOfWayRelations) {
    const yieldLaneIds: string[] = []
    for (const member of re.members) {
      if (member.type !== 'relation' || member.role !== 'yield') continue
      const yieldLane = laneByOsmId.get(member.ref)
      if (yieldLane && !yieldLaneIds.includes(yieldLane.id)) yieldLaneIds.push(yieldLane.id)
    }
    if (yieldLaneIds.length === 0) continue
    for (const member of re.members) {
      if (member.type !== 'relation' || member.role !== 'right_of_way') continue
      const rowLane = laneByOsmId.get(member.ref)
      if (!rowLane) continue
      // 同じ lanelet が複数の right_of_way RE に属する場合があるため union する
      const merged = rowLane.yieldLaneIds ?? []
      for (const id of yieldLaneIds) {
        if (!merged.includes(id)) merged.push(id)
      }
      rowLane.yieldLaneIds = merged
    }
  }

  // Bounds across all materialized points.
  for (const point of result.points) {
    if (point.x < result.bounds.minX) result.bounds.minX = point.x
    if (point.x > result.bounds.maxX) result.bounds.maxX = point.x
    if (point.y < result.bounds.minY) result.bounds.minY = point.y
    if (point.y > result.bounds.maxY) result.bounds.maxY = point.y
  }
  if (result.points.length > 0) {
    result.bounds.width = result.bounds.maxX - result.bounds.minX
    result.bounds.height = result.bounds.maxY - result.bounds.minY
    result.bounds.centerX = result.bounds.minX + result.bounds.width / 2
    result.bounds.centerY = result.bounds.minY + result.bounds.height / 2
  }

  return result
}
