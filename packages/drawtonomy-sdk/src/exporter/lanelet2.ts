// Lanelet2 (.osm XML) exporter — emits an OSM document from a snapshot.
// No external library dependencies.
//
// Behavior summary:
// - Each PointShape becomes a `<node>`
// - Each LinestringShape becomes a `<way>` referencing its point nodes
// - Each LaneShape becomes a `<relation type=lanelet>` referencing its
//   left/right way as members
// - Each TrafficLightShape carrying `affectedLaneIds` becomes a
//   `<relation type=regulatory_element subtype=traffic_light>` whose "refers"
//   member is a synthesized 2-node way at the signal position and whose
//   "ref_line" member is the stop line way; affected lanelet relations gain a
//   `role=regulatory_element` member pointing back at it
// - Each TrafficSignShape carrying `affectedLaneIds` becomes a
//   `<relation type=regulatory_element subtype=traffic_sign>` (or
//   `subtype=speed_limit` for speed limit signs, carrying the standard
//   `sign_type` tag) with the same refers / ref_line structure; the refers
//   way is tagged `type=traffic_sign subtype=<sign code>`
// - Each LaneShape carrying `yieldLaneIds` additionally emits a
//   `<relation type=regulatory_element subtype=right_of_way>` whose
//   "right_of_way" member is the lane's lanelet and whose "yield" members are
//   the yielding lanelets
// - Each CrosswalkShape carrying `affectedLaneIds` emits a synthesized
//   crosswalk lanelet (subtype=crosswalk), a crosswalk_polygon way, and a
//   `<relation type=regulatory_element subtype=crosswalk>` referenced back by
//   the affected lanelets
// - When a sidecar (the original OSM XML captured at import time) is supplied,
//   tags / `ele` / unrelated relations (regulatory_element etc.) are
//   round-tripped: shape-derived entries override the sidecar copies for the
//   same OSM IDs, and untouched entries are emitted verbatim in the original
//   order.
// - The root `<osm>` element carries `drawtonomy_origin_lat` /
//   `drawtonomy_origin_lon` so re-importing the file restores the same canvas
//   origin. Standard OSM consumers ignore unknown attributes.

import type {
  BaseShape,
  CrosswalkProps,
  DrawtonomySnapshot,
  LaneProps,
  LinestringProps,
  PointProps,
  TrafficLightProps,
  TrafficSignProps,
} from '../types'
import { canvasToLatLon, parseOsmXml, type OsmData } from './osmParser'

type LaneShape = BaseShape<'lane', LaneProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>
type TrafficLightShape = BaseShape<'traffic_light', TrafficLightProps>
type TrafficSignShape = BaseShape<'traffic_sign', TrafficSignProps>
type CrosswalkShape = BaseShape<'crosswalk', CrosswalkProps>

/**
 * Sign code (Lanelet2 traffic sign subtype, e.g. "de274" / "usR1-1") of a
 * traffic sign shape. `sign_code` wins; a `subtype` that is not one of the
 * regulatory element subtypes (round-trip metadata) is accepted as a code.
 */
export function trafficSignCode(attrs: Record<string, string | undefined>): string {
  if (attrs.sign_code) return attrs.sign_code
  if (attrs.subtype && attrs.subtype !== 'traffic_sign' && attrs.subtype !== 'speed_limit') {
    return attrs.subtype
  }
  return 'unknown'
}

/**
 * Regulatory element subtype of a traffic sign shape: `speed_limit` when the
 * shape came from / represents a speed limit (recorded RE subtype or a
 * lanelet2 `sign_type` value such as "50 km/h"), otherwise `traffic_sign`.
 */
export function trafficSignRelationSubtype(
  attrs: Record<string, string | undefined>
): 'traffic_sign' | 'speed_limit' {
  return attrs.subtype === 'speed_limit' || attrs.sign_type ? 'speed_limit' : 'traffic_sign'
}

/** Sidecar captured at OSM import time. Used to round-trip tags / `ele`. */
export interface OsmSidecar {
  rawXml: string
  originLat: number
  originLon: number
}

/** Origin to use when no sidecar is provided. */
export interface MapOrigin {
  lat: number | null
  lon: number | null
}

export interface Lanelet2ExportOptions {
  sidecar?: OsmSidecar | null
  mapOrigin?: MapOrigin | null
}

/**
 * Default origin used when neither a sidecar nor a map origin is supplied.
 * Tokyo Teleport Station — picked because it is in a flat area visible at
 * default zoom on most map providers.
 */
export const DEFAULT_ORIGIN_LAT = 35.62614
export const DEFAULT_ORIGIN_LON = 139.77525

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatLatLon(v: number): string {
  // 11 decimal places ≈ 0.1 mm precision.
  return v.toFixed(11)
}

function formatEle(v: number): string {
  // 3 decimal places = 1 mm precision.
  return v.toFixed(3)
}

interface NodeOut {
  id: string
  lat: number
  lon: number
  ele?: number
  tags: Record<string, string>
}

interface WayOut {
  id: string
  nodeRefs: string[]
  tags: Record<string, string>
}

interface RelationOut {
  id: string
  members: { type: string; ref: string; role: string }[]
  tags: Record<string, string>
}

function buildShapeMap(shapes: readonly BaseShape[]): Map<string, BaseShape> {
  const map = new Map<string, BaseShape>()
  for (const s of shapes) map.set(s.id, s)
  return map
}

function buildFromShapes(
  shapes: readonly BaseShape[],
  originLat: number,
  originLon: number,
  sidecarData: OsmData | null
): {
  nodes: Map<string, NodeOut>
  ways: Map<string, WayOut>
  relations: RelationOut[]
  shapeNodeOsmIds: Set<string>
  shapeWayOsmIds: Set<string>
  shapeRelationOsmIds: Set<string>
} {
  const shapeMap = buildShapeMap(shapes)
  const points: PointShape[] = []
  const linestrings: LinestringShape[] = []
  const lanes: LaneShape[] = []
  const trafficLights: TrafficLightShape[] = []
  const trafficSigns: TrafficSignShape[] = []
  const crosswalks: CrosswalkShape[] = []
  for (const s of shapes) {
    if (s.type === 'point') points.push(s as unknown as PointShape)
    else if (s.type === 'linestring') linestrings.push(s as unknown as LinestringShape)
    else if (s.type === 'lane') lanes.push(s as unknown as LaneShape)
    else if (s.type === 'traffic_light') trafficLights.push(s as unknown as TrafficLightShape)
    else if (s.type === 'traffic_sign') trafficSigns.push(s as unknown as TrafficSignShape)
    else if (s.type === 'crosswalk') crosswalks.push(s as unknown as CrosswalkShape)
  }

  const nodesOut = new Map<string, NodeOut>()
  const waysOut = new Map<string, WayOut>()
  const relationsOut: RelationOut[] = []

  const shapeNodeOsmIds = new Set<string>()
  const shapeWayOsmIds = new Set<string>()
  const shapeRelationOsmIds = new Set<string>()

  // Resolve a shape -> OSM ID. Empty `osmId` (newly drawn shape) gets a fresh
  // negative ID, matching the OSM convention for unsubmitted edits. Fresh IDs
  // must never collide with negative IDs already taken by imported shapes or
  // sidecar elements (maps previously exported from here use negative IDs),
  // so allocation starts below every reserved ID.
  let nextNewId = -1
  const reserveId = (id: string | undefined): void => {
    if (!id) return
    const n = Number(id)
    if (Number.isInteger(n) && n <= nextNewId) nextNewId = n - 1
  }
  for (const s of shapes) {
    const props = s.props as { osmId?: string; attributes?: Record<string, string | undefined> }
    reserveId(props.osmId)
    reserveId(props.attributes?.refers_osm_id)
  }
  if (sidecarData) {
    for (const id of sidecarData.nodes.keys()) reserveId(id)
    for (const id of sidecarData.ways.keys()) reserveId(id)
    for (const r of sidecarData.relations) reserveId(r.id)
  }
  const newIdFor = new Map<string, string>()
  const resolveOsmId = (shapeId: string, propsOsmId: string | undefined): string => {
    if (propsOsmId && propsOsmId.length > 0) return propsOsmId
    const cached = newIdFor.get(shapeId)
    if (cached !== undefined) return cached
    const id = String(nextNewId--)
    newIdFor.set(shapeId, id)
    return id
  }

  // Points -> nodes.
  for (const p of points) {
    const osmId = resolveOsmId(p.id, p.props.osmId)
    shapeNodeOsmIds.add(osmId)
    const { lat, lon } = canvasToLatLon(p.x, p.y, originLat, originLon)
    const original = sidecarData?.nodes.get(osmId)
    const tags = original ? { ...original.tags } : {}
    // Downstream consumers (e.g. Autoware) require an elevation tag on every
    // node; default to 0 for nodes drawn on the 2D canvas.
    const ele = original?.ele ?? 0
    nodesOut.set(osmId, { id: osmId, lat, lon, ele, tags })
  }

  // Linestrings -> ways.
  for (const ls of linestrings) {
    const osmId = resolveOsmId(ls.id, ls.props.osmId)
    shapeWayOsmIds.add(osmId)
    const nodeRefs: string[] = []
    for (const pid of ls.props.pointIds) {
      const point = shapeMap.get(pid) as unknown as PointShape | undefined
      if (!point) continue
      nodeRefs.push(resolveOsmId(point.id, point.props.osmId))
    }
    const original = sidecarData?.ways.get(osmId)
    const tags: Record<string, string> = original ? { ...original.tags } : {}
    if (ls.props.attributes) {
      for (const [k, v] of Object.entries(ls.props.attributes)) {
        if (v !== undefined && v !== null && v !== '') tags[k] = String(v)
      }
    }
    if (!tags.type) tags.type = 'line_thin'
    waysOut.set(osmId, { id: osmId, nodeRefs, tags })
  }

  // Lanes -> relations (type=lanelet).
  const laneRelationByShapeId = new Map<string, RelationOut>()
  for (const lane of lanes) {
    const osmId = resolveOsmId(lane.id, lane.props.osmId)
    shapeRelationOsmIds.add(osmId)

    const original = sidecarData?.relations.find(r => r.id === osmId)
    const members: { type: string; ref: string; role: string }[] = []

    let leftWayId: string | null = null
    let rightWayId: string | null = null
    if (lane.props.leftBoundaryId) {
      const leftLs = shapeMap.get(lane.props.leftBoundaryId) as unknown as LinestringShape | undefined
      if (leftLs) leftWayId = resolveOsmId(leftLs.id, leftLs.props.osmId)
    }
    if (lane.props.rightBoundaryId) {
      const rightLs = shapeMap.get(lane.props.rightBoundaryId) as unknown as LinestringShape | undefined
      if (rightLs) rightWayId = resolveOsmId(rightLs.id, rightLs.props.osmId)
    }

    if (original) {
      // Preserve the original member order; only refresh left/right refs.
      for (const m of original.members) {
        if (m.type === 'way' && m.role === 'left' && leftWayId) {
          members.push({ type: 'way', ref: leftWayId, role: 'left' })
        } else if (m.type === 'way' && m.role === 'right' && rightWayId) {
          members.push({ type: 'way', ref: rightWayId, role: 'right' })
        } else {
          members.push({ ...m })
        }
      }
    } else {
      if (leftWayId) members.push({ type: 'way', ref: leftWayId, role: 'left' })
      if (rightWayId) members.push({ type: 'way', ref: rightWayId, role: 'right' })
    }

    const tags: Record<string, string> = original ? { ...original.tags } : {}
    if (lane.props.attributes) {
      for (const [k, v] of Object.entries(lane.props.attributes)) {
        if (v !== undefined && v !== null && v !== '') tags[k] = String(v)
      }
    }
    if (!tags.type) tags.type = 'lanelet'
    const relationOut: RelationOut = { id: osmId, members, tags }
    relationsOut.push(relationOut)
    laneRelationByShapeId.set(lane.id, relationOut)
  }

  // Traffic lights / signs with affected lanes -> relations
  // (type=regulatory_element, subtype=traffic_light / traffic_sign /
  // speed_limit). The signal or sign itself is represented as a 2-node
  // "refers" way spanning the shape's width; the stop line (when present)
  // joins as the "ref_line" way, and each affected lanelet references the
  // regulatory element back.
  const linkAffectedLanelets = (reOsmId: string, affected: readonly string[]): void => {
    // Reference the regulatory element from each affected lanelet (sidecar
    // relations may already carry the member; avoid duplicating it).
    for (const laneShapeId of affected) {
      const laneRel = laneRelationByShapeId.get(laneShapeId)
      if (!laneRel) continue
      const exists = laneRel.members.some(
        m => m.type === 'relation' && m.role === 'regulatory_element' && m.ref === reOsmId
      )
      if (!exists) {
        laneRel.members.push({ type: 'relation', ref: reOsmId, role: 'regulatory_element' })
      }
    }
  }

  // Shared emission for refers-way-based regulatory elements (traffic lights
  // and traffic signs). The two callbacks finalize the format-specific tags
  // of the synthesized refers way and of the regulatory element relation.
  const emitRefersRegulatoryElement = (
    shape: TrafficLightShape | TrafficSignShape,
    finishRefersTags: (tags: Record<string, string>, attrs: Record<string, string | undefined>) => void,
    finishRelationTags: (tags: Record<string, string>, attrs: Record<string, string | undefined>) => void
  ): void => {
    const affected = shape.props.affectedLaneIds ?? []
    if (affected.length === 0) return

    const attrs = (shape.props.attributes ?? {}) as Record<string, string | undefined>
    const reOsmId = resolveOsmId(shape.id, shape.props.osmId)
    shapeRelationOsmIds.add(reOsmId)

    // Round-trip fidelity: a signal imported from this sidecar and left
    // unedited re-emits its original refers way / nodes / relation verbatim.
    // The 2-node synthesis below would otherwise lose the original way's
    // orientation, elevation and any extra members (light_bulbs etc.).
    const originalRelation = sidecarData?.relations.find(r => r.id === reOsmId)
    const recordedRefersId = attrs.refers_osm_id
    const originalRefers = recordedRefersId ? sidecarData?.ways.get(recordedRefersId) : undefined
    if (originalRelation && originalRefers && originalRefers.nodeRefs.length >= 2) {
      const nodeA = sidecarData?.nodes.get(originalRefers.nodeRefs[0])
      const nodeB = sidecarData?.nodes.get(originalRefers.nodeRefs[originalRefers.nodeRefs.length - 1])
      const current = canvasToLatLon(shape.x, shape.y, originLat, originLon)
      // Unmoved = the shape still sits at the refers way midpoint (import
      // placed it there; ~1e-9 deg covers projection round-trip fp error).
      const unmoved =
        !!nodeA && !!nodeB &&
        Math.abs((nodeA.lat + nodeB.lat) / 2 - current.lat) < 1e-9 &&
        Math.abs((nodeA.lon + nodeB.lon) / 2 - current.lon) < 1e-9
      // The stop line link must still match the original ref_line member.
      const originalRefLine = originalRelation.members.find(
        m => m.type === 'way' && m.role === 'ref_line'
      )?.ref
      const stopLs = shape.props.stopLineId
        ? (shapeMap.get(shape.props.stopLineId) as unknown as LinestringShape | undefined)
        : undefined
      const currentRefLine = stopLs ? resolveOsmId(stopLs.id, stopLs.props.osmId) : undefined
      if (unmoved && originalRefLine === currentRefLine) {
        for (const nid of originalRefers.nodeRefs) {
          const n = sidecarData?.nodes.get(nid)
          if (!n) continue
          shapeNodeOsmIds.add(nid)
          nodesOut.set(nid, { id: nid, lat: n.lat, lon: n.lon, ele: n.ele, tags: { ...n.tags } })
        }
        shapeWayOsmIds.add(originalRefers.id)
        waysOut.set(originalRefers.id, {
          id: originalRefers.id,
          nodeRefs: [...originalRefers.nodeRefs],
          tags: { ...originalRefers.tags },
        })
        relationsOut.push({
          id: reOsmId,
          members: originalRelation.members.map(m => ({ ...m })),
          tags: { ...originalRelation.tags },
        })
        linkAffectedLanelets(reOsmId, affected)
        return
      }
    }

    // "refers" way: reuse the way / node IDs recorded at import time (the
    // `refers_osm_id` attribute) so the sidecar copies are overridden rather
    // than duplicated; otherwise allocate fresh negative IDs.
    const refersWayId = attrs.refers_osm_id || resolveOsmId(`${shape.id}#refers`, undefined)
    const sidecarRefers = sidecarData?.ways.get(refersWayId)
    const reuseNodes = !!sidecarRefers && sidecarRefers.nodeRefs.length >= 2
    const nodeIdA = reuseNodes
      ? sidecarRefers.nodeRefs[0]
      : resolveOsmId(`${shape.id}#refers_a`, undefined)
    const nodeIdB = reuseNodes
      ? sidecarRefers.nodeRefs[sidecarRefers.nodeRefs.length - 1]
      : resolveOsmId(`${shape.id}#refers_b`, undefined)
    const halfW = (shape.props.w ?? 0) / 2
    const a = canvasToLatLon(shape.x - halfW, shape.y, originLat, originLon)
    const b = canvasToLatLon(shape.x + halfW, shape.y, originLat, originLon)
    for (const [nid, ll] of [[nodeIdA, a], [nodeIdB, b]] as const) {
      shapeNodeOsmIds.add(nid)
      const originalNode = sidecarData?.nodes.get(nid)
      nodesOut.set(nid, {
        id: nid,
        lat: ll.lat,
        lon: ll.lon,
        ele: originalNode?.ele ?? 0,
        tags: originalNode ? { ...originalNode.tags } : {},
      })
    }
    shapeWayOsmIds.add(refersWayId)
    const refersTags: Record<string, string> = sidecarRefers ? { ...sidecarRefers.tags } : {}
    finishRefersTags(refersTags, attrs)
    waysOut.set(refersWayId, { id: refersWayId, nodeRefs: [nodeIdA, nodeIdB], tags: refersTags })

    const members: { type: string; ref: string; role: string }[] = [
      { type: 'way', ref: refersWayId, role: 'refers' },
    ]

    // "ref_line": the stop line linestring, already exported as a way above.
    // Ensure the way carries type=stop_line so consumers recognize it.
    if (shape.props.stopLineId) {
      const stopLs = shapeMap.get(shape.props.stopLineId) as unknown as LinestringShape | undefined
      if (stopLs) {
        const stopWayId = resolveOsmId(stopLs.id, stopLs.props.osmId)
        const stopWay = waysOut.get(stopWayId)
        if (stopWay && stopWay.tags.type !== 'stop_line') stopWay.tags.type = 'stop_line'
        members.push({ type: 'way', ref: stopWayId, role: 'ref_line' })
      }
    }

    const tags: Record<string, string> = originalRelation ? { ...originalRelation.tags } : {}
    finishRelationTags(tags, attrs)
    relationsOut.push({ id: reOsmId, members, tags })

    linkAffectedLanelets(reOsmId, affected)
  }

  for (const tl of trafficLights) {
    emitRefersRegulatoryElement(
      tl,
      (refersTags, attrs) => {
        refersTags.type = 'traffic_light'
        // Autoware requires subtype and height on the traffic light way; keep
        // sidecar values when present, allow shape attributes to override, and
        // fall back to the common defaults.
        if (!refersTags.subtype) refersTags.subtype = attrs.subtype || 'red_yellow_green'
        if (!refersTags.height) refersTags.height = attrs.height || '0.5'
      },
      tags => {
        tags.type = 'regulatory_element'
        tags.subtype = 'traffic_light'
      }
    )
  }

  for (const ts of trafficSigns) {
    emitRefersRegulatoryElement(
      ts,
      (refersTags, attrs) => {
        refersTags.type = 'traffic_sign'
        // The refers way carries the sign code as its subtype (ISO 3166
        // region code + sign number). A sidecar subtype only survives when
        // the shape has no code of its own.
        const code = trafficSignCode(attrs)
        if (!refersTags.subtype || code !== 'unknown') refersTags.subtype = code
      },
      (tags, attrs) => {
        tags.type = 'regulatory_element'
        tags.subtype = trafficSignRelationSubtype(attrs)
        // Lanelet2 speed_limit convention: the value with unit (e.g.
        // "50 km/h") rides on the relation as `sign_type`.
        if (attrs.sign_type) tags.sign_type = attrs.sign_type
      }
    )
  }

  // Lanes with yieldLaneIds -> relations (type=regulatory_element,
  // subtype=right_of_way). The lane plays the "right_of_way" role and each
  // yielding lanelet joins with the "yield" role.
  //
  // Editor props store a flat per-lane union (`yieldLaneIds`), while a Lanelet2
  // map may partition the same facts across several relations (one relation
  // with many right_of_way lanelets, one lanelet in many relations, extra
  // ref_line/refers members). To stay round-trip stable the export works in
  // three steps:
  //   1. sidecar RoW relations still fully satisfied by current props are
  //      kept verbatim (not claimed, byte-stable)
  //   2. sidecar RoW relations whose links were edited are rebuilt in place
  //      (same osmId, member order preserved, removed links dropped)
  //   3. yield links not covered by any sidecar relation are emitted as new
  //      per-lane relations
  const materializedLaneletIds = new Set<string>()
  for (const rel of laneRelationByShapeId.values()) materializedLaneletIds.add(rel.id)

  // laneletRef -> { laneShapeId, yieldLaneletRefs } (lanes that declare yields)
  const rowInfoByLaneletRef = new Map<string, { laneShapeId: string; yieldRefs: Set<string> }>()
  for (const lane of lanes) {
    const yieldIds = lane.props.yieldLaneIds ?? []
    const laneRel = laneRelationByShapeId.get(lane.id)
    if (!laneRel) continue
    const yieldRefs = new Set<string>()
    for (const yieldShapeId of yieldIds) {
      const yieldRel = laneRelationByShapeId.get(yieldShapeId)
      if (yieldRel) yieldRefs.add(yieldRel.id)
    }
    rowInfoByLaneletRef.set(laneRel.id, { laneShapeId: lane.id, yieldRefs })
  }

  // laneletRef -> sidecar 由来でカバー済みの yield lanelet refs
  const coveredYieldRefs = new Map<string, Set<string>>()
  const coverageOf = (rowRef: string): Set<string> => {
    let set = coveredYieldRefs.get(rowRef)
    if (!set) {
      set = new Set()
      coveredYieldRefs.set(rowRef, set)
    }
    return set
  }

  const sidecarRowREs = (sidecarData?.relations ?? []).filter(
    r => r.tags.type === 'regulatory_element' && r.tags.subtype === 'right_of_way'
  )
  for (const re of sidecarRowREs) {
    const rowMembers = re.members.filter(m => m.type === 'relation' && m.role === 'right_of_way')
    const yieldMembers = re.members.filter(m => m.type === 'relation' && m.role === 'yield')
    // shape 化された lanelet のみが編集対象。非 materialize の member は素通し
    const rowMat = rowMembers.map(m => m.ref).filter(ref => materializedLaneletIds.has(ref))
    const yieldMat = yieldMembers.map(m => m.ref).filter(ref => materializedLaneletIds.has(ref))
    if (rowMat.length === 0 || yieldMat.length === 0) continue

    // 全 right_of_way lanelet が今もこの relation の yield 群を保持しているか
    const satisfied = rowMat.every(rowRef => {
      const info = rowInfoByLaneletRef.get(rowRef)
      return !!info && yieldMat.every(y => info.yieldRefs.has(y))
    })

    if (satisfied) {
      // 無編集: sidecar 素通し (claim しない) でバイト安定に保つ
      for (const rowRef of rowMat) {
        for (const y of yieldMat) coverageOf(rowRef).add(y)
      }
      continue
    }

    // 編集あり: 同 osmId で再構築 (member 順は保持しつつ、外れたリンクを除去)
    shapeRelationOsmIds.add(re.id)
    const members: { type: string; ref: string; role: string }[] = []
    const keptRowRefs: string[] = []
    for (const m of re.members) {
      if (m.type === 'relation' && m.role === 'right_of_way') {
        if (!materializedLaneletIds.has(m.ref)) {
          members.push({ ...m })
          continue
        }
        const info = rowInfoByLaneletRef.get(m.ref)
        // この relation の yield を1つも保持しないレーンは right_of_way から外す
        if (info && yieldMat.some(y => info.yieldRefs.has(y))) {
          members.push({ ...m })
          keptRowRefs.push(m.ref)
        }
        continue
      }
      if (m.type === 'relation' && m.role === 'yield') {
        if (!materializedLaneletIds.has(m.ref)) {
          members.push({ ...m })
          continue
        }
        const stillReferenced = rowMat.some(rowRef => {
          const info = rowInfoByLaneletRef.get(rowRef)
          return !!info && info.yieldRefs.has(m.ref)
        })
        if (stillReferenced) members.push({ ...m })
        continue
      }
      // ref_line / refers / その他のメンバーはそのまま保持
      members.push({ ...m })
    }
    const keptYieldRefs = members
      .filter(m => m.type === 'relation' && m.role === 'yield')
      .map(m => m.ref)
    for (const rowRef of keptRowRefs) {
      const info = rowInfoByLaneletRef.get(rowRef)
      if (!info) continue
      for (const y of keptYieldRefs) {
        if (info.yieldRefs.has(y)) coverageOf(rowRef).add(y)
      }
    }

    const tags: Record<string, string> = { ...re.tags }
    tags.type = 'regulatory_element'
    tags.subtype = 'right_of_way'
    relationsOut.push({ id: re.id, members, tags })

    linkAffectedLanelets(
      re.id,
      keptRowRefs
        .map(ref => rowInfoByLaneletRef.get(ref)?.laneShapeId)
        .filter((id): id is string => !!id)
    )
  }

  // sidecar でカバーされなかった yield リンクはレーンごとに新規 relation を生成
  for (const lane of lanes) {
    const laneRel = laneRelationByShapeId.get(lane.id)
    if (!laneRel) continue
    const info = rowInfoByLaneletRef.get(laneRel.id)
    if (!info || info.yieldRefs.size === 0) continue
    const covered = coveredYieldRefs.get(laneRel.id)
    const residual = [...info.yieldRefs].filter(ref => !covered?.has(ref))
    if (residual.length === 0) continue

    const reOsmId = resolveOsmId(`${lane.id}#right_of_way`, undefined)
    shapeRelationOsmIds.add(reOsmId)
    const members: { type: string; ref: string; role: string }[] = [
      { type: 'relation', ref: laneRel.id, role: 'right_of_way' },
    ]
    for (const ref of residual) members.push({ type: 'relation', ref, role: 'yield' })
    relationsOut.push({
      id: reOsmId,
      members,
      tags: { type: 'regulatory_element', subtype: 'right_of_way' },
    })
    linkAffectedLanelets(reOsmId, [lane.id])
  }

  // Crosswalks with affected lanes -> a synthesized crosswalk lanelet (the
  // walking band's long edges as left/right ways), a crosswalk_polygon way
  // (band outline), and a relation (type=regulatory_element,
  // subtype=crosswalk) tying them together with the optional stop line.
  // Way / node ids recorded at import time are reused so sidecar copies are
  // overridden rather than duplicated.
  for (const cw of crosswalks) {
    // Dangling ids (deleted lanes) do not count: a crosswalk whose links all
    // resolve to nothing is treated like an unlinked one and stays sidecar-only.
    const affected = (cw.props.affectedLaneIds ?? []).filter(id => laneRelationByShapeId.has(id))
    if (affected.length === 0) continue

    const attrs = (cw.props.attributes ?? {}) as Record<string, string | undefined>
    const reOsmId = resolveOsmId(cw.id, cw.props.osmId)
    shapeRelationOsmIds.add(reOsmId)

    // Band geometry: axis from start to end (walking direction), band width
    // across it. The shape rotation is applied about the shape center,
    // matching the OpenDRIVE exporter's convention.
    const rotRad = ((cw.rotation || 0) * Math.PI) / 180
    const cosR = Math.cos(rotRad)
    const sinR = Math.sin(rotRad)
    const centerX = cw.x + (cw.props.startX + cw.props.endX) / 2
    const centerY = cw.y + (cw.props.startY + cw.props.endY) / 2
    const halfDxLocal = (cw.props.endX - cw.props.startX) / 2
    const halfDyLocal = (cw.props.endY - cw.props.startY) / 2
    const halfDx = halfDxLocal * cosR - halfDyLocal * sinR
    const halfDy = halfDxLocal * sinR + halfDyLocal * cosR
    const axisLen = Math.hypot(halfDx, halfDy) * 2
    if (axisLen < 1e-6) continue
    const dirX = (halfDx * 2) / axisLen
    const dirY = (halfDy * 2) / axisLen
    // Unit normal toward the left of the walking direction (screen Y down).
    const leftNX = dirY
    const leftNY = -dirX
    const halfW = (cw.props.crosswalkWidth ?? 0) / 2
    const ax = centerX - halfDx
    const ay = centerY - halfDy
    const bx = centerX + halfDx
    const by = centerY + halfDy

    const laneletOsmId = attrs.crosswalk_lanelet_osm_id || resolveOsmId(`${cw.id}#lanelet`, undefined)
    const leftWayId = attrs.crosswalk_left_osm_id || resolveOsmId(`${cw.id}#left`, undefined)
    const rightWayId = attrs.crosswalk_right_osm_id || resolveOsmId(`${cw.id}#right`, undefined)
    const polygonWayId = attrs.crosswalk_polygon_osm_id || resolveOsmId(`${cw.id}#polygon`, undefined)

    // Node ids: reuse the sidecar boundary ways' endpoints when present.
    const sidecarLeft = sidecarData?.ways.get(leftWayId)
    const sidecarRight = sidecarData?.ways.get(rightWayId)
    const reuseLeft = !!sidecarLeft && sidecarLeft.nodeRefs.length >= 2
    const reuseRight = !!sidecarRight && sidecarRight.nodeRefs.length >= 2
    const nodeLA = reuseLeft ? sidecarLeft.nodeRefs[0] : resolveOsmId(`${cw.id}#left_a`, undefined)
    const nodeLB = reuseLeft
      ? sidecarLeft.nodeRefs[sidecarLeft.nodeRefs.length - 1]
      : resolveOsmId(`${cw.id}#left_b`, undefined)
    const nodeRA = reuseRight ? sidecarRight.nodeRefs[0] : resolveOsmId(`${cw.id}#right_a`, undefined)
    const nodeRB = reuseRight
      ? sidecarRight.nodeRefs[sidecarRight.nodeRefs.length - 1]
      : resolveOsmId(`${cw.id}#right_b`, undefined)

    const corners: [string, number, number][] = [
      [nodeLA, ax + leftNX * halfW, ay + leftNY * halfW],
      [nodeLB, bx + leftNX * halfW, by + leftNY * halfW],
      [nodeRA, ax - leftNX * halfW, ay - leftNY * halfW],
      [nodeRB, bx - leftNX * halfW, by - leftNY * halfW],
    ]
    for (const [nid, x, y] of corners) {
      shapeNodeOsmIds.add(nid)
      const ll = canvasToLatLon(x, y, originLat, originLon)
      const originalNode = sidecarData?.nodes.get(nid)
      nodesOut.set(nid, {
        id: nid,
        lat: ll.lat,
        lon: ll.lon,
        ele: originalNode?.ele ?? 0,
        tags: originalNode ? { ...originalNode.tags } : {},
      })
    }

    shapeWayOsmIds.add(leftWayId)
    waysOut.set(leftWayId, {
      id: leftWayId,
      nodeRefs: [nodeLA, nodeLB],
      tags: sidecarLeft ? { ...sidecarLeft.tags } : {},
    })
    shapeWayOsmIds.add(rightWayId)
    waysOut.set(rightWayId, {
      id: rightWayId,
      nodeRefs: [nodeRA, nodeRB],
      tags: sidecarRight ? { ...sidecarRight.tags } : {},
    })

    // Band outline (closed ring over the four corners).
    const sidecarPolygon = sidecarData?.ways.get(polygonWayId)
    const polygonTags: Record<string, string> = sidecarPolygon ? { ...sidecarPolygon.tags } : {}
    if (!polygonTags.type) polygonTags.type = 'crosswalk_polygon'
    if (!polygonTags.area) polygonTags.area = 'yes'
    shapeWayOsmIds.add(polygonWayId)
    waysOut.set(polygonWayId, {
      id: polygonWayId,
      nodeRefs: [nodeLA, nodeLB, nodeRB, nodeRA, nodeLA],
      tags: polygonTags,
    })

    // Crosswalk lanelet (type=lanelet, subtype=crosswalk).
    const sidecarLanelet = sidecarData?.relations.find(r => r.id === laneletOsmId)
    const laneletTags: Record<string, string> = sidecarLanelet ? { ...sidecarLanelet.tags } : {}
    laneletTags.type = 'lanelet'
    laneletTags.subtype = 'crosswalk'
    shapeRelationOsmIds.add(laneletOsmId)
    relationsOut.push({
      id: laneletOsmId,
      members: [
        { type: 'way', ref: leftWayId, role: 'left' },
        { type: 'way', ref: rightWayId, role: 'right' },
      ],
      tags: laneletTags,
    })

    const members: { type: string; ref: string; role: string }[] = [
      { type: 'relation', ref: laneletOsmId, role: 'refers' },
      { type: 'way', ref: polygonWayId, role: 'crosswalk_polygon' },
    ]
    if (cw.props.stopLineId) {
      const stopLs = shapeMap.get(cw.props.stopLineId) as unknown as LinestringShape | undefined
      if (stopLs) {
        const stopWayId = resolveOsmId(stopLs.id, stopLs.props.osmId)
        const stopWay = waysOut.get(stopWayId)
        if (stopWay && stopWay.tags.type !== 'stop_line') stopWay.tags.type = 'stop_line'
        members.push({ type: 'way', ref: stopWayId, role: 'ref_line' })
      }
    }

    const sidecarRe = sidecarData?.relations.find(r => r.id === reOsmId)
    const tags: Record<string, string> = sidecarRe ? { ...sidecarRe.tags } : {}
    tags.type = 'regulatory_element'
    tags.subtype = 'crosswalk'
    relationsOut.push({ id: reOsmId, members, tags })

    linkAffectedLanelets(reOsmId, affected)
  }

  return { nodes: nodesOut, ways: waysOut, relations: relationsOut, shapeNodeOsmIds, shapeWayOsmIds, shapeRelationOsmIds }
}

function nodeToXml(node: NodeOut): string {
  const tags: string[] = []
  // `ele` is emitted as a tag (Lanelet2 OSM convention).
  const tagEntries = Object.entries(node.tags).filter(([k]) => k !== 'ele')
  if (node.ele !== undefined) {
    tags.push(`    <tag k='ele' v='${escapeXml(formatEle(node.ele))}' />`)
  } else if (node.tags.ele !== undefined) {
    tags.push(`    <tag k='ele' v='${escapeXml(node.tags.ele)}' />`)
  }
  for (const [k, v] of tagEntries) {
    tags.push(`    <tag k='${escapeXml(k)}' v='${escapeXml(v)}' />`)
  }
  if (tags.length === 0) {
    return `  <node id='${escapeXml(node.id)}' visible='true' version='1' lat='${formatLatLon(node.lat)}' lon='${formatLatLon(node.lon)}' />\n`
  }
  let xml = `  <node id='${escapeXml(node.id)}' visible='true' version='1' lat='${formatLatLon(node.lat)}' lon='${formatLatLon(node.lon)}'>\n`
  xml += tags.join('\n') + '\n'
  xml += `  </node>\n`
  return xml
}

function wayToXml(way: WayOut): string {
  let xml = `  <way id='${escapeXml(way.id)}' visible='true' version='1'>\n`
  for (const ref of way.nodeRefs) {
    xml += `    <nd ref='${escapeXml(ref)}' />\n`
  }
  for (const [k, v] of Object.entries(way.tags)) {
    xml += `    <tag k='${escapeXml(k)}' v='${escapeXml(v)}' />\n`
  }
  xml += `  </way>\n`
  return xml
}

function relationToXml(rel: RelationOut): string {
  let xml = `  <relation id='${escapeXml(rel.id)}' visible='true' version='1'>\n`
  for (const m of rel.members) {
    xml += `    <member type='${escapeXml(m.type)}' ref='${escapeXml(m.ref)}' role='${escapeXml(m.role)}' />\n`
  }
  for (const [k, v] of Object.entries(rel.tags)) {
    xml += `    <tag k='${escapeXml(k)}' v='${escapeXml(v)}' />\n`
  }
  xml += `  </relation>\n`
  return xml
}

/** Build a Lanelet2 OSM XML document from a snapshot. */
export function exportToLanelet2(
  snapshot: DrawtonomySnapshot,
  options: Lanelet2ExportOptions = {}
): string {
  const { sidecar = null, mapOrigin = null } = options

  // Sidecar wins (= round-trip from import). Otherwise fall back to the
  // current map origin, then DEFAULT.
  let originLat: number
  let originLon: number
  if (sidecar) {
    originLat = sidecar.originLat
    originLon = sidecar.originLon
  } else {
    originLat = mapOrigin?.lat ?? DEFAULT_ORIGIN_LAT
    originLon = mapOrigin?.lon ?? DEFAULT_ORIGIN_LON
  }

  const sidecarData: OsmData | null = sidecar ? parseOsmXml(sidecar.rawXml) : null
  const fromShapes = buildFromShapes(snapshot.shapes, originLat, originLon, sidecarData)

  // Combine: sidecar entries (skipping IDs that shapes overwrite) + shape-derived entries.
  // Sidecar order is preserved to keep round-trips stable.
  const finalNodes: NodeOut[] = []
  const finalWays: WayOut[] = []
  const finalRelations: RelationOut[] = []
  if (sidecarData) {
    sidecarData.nodes.forEach((n, id) => {
      if (fromShapes.shapeNodeOsmIds.has(id)) return
      finalNodes.push({ id, lat: n.lat, lon: n.lon, ele: n.ele, tags: n.tags })
    })
    sidecarData.ways.forEach((w, id) => {
      if (fromShapes.shapeWayOsmIds.has(id)) return
      finalWays.push({ id, nodeRefs: w.nodeRefs, tags: w.tags })
    })
    for (const r of sidecarData.relations) {
      if (fromShapes.shapeRelationOsmIds.has(r.id)) continue
      finalRelations.push({ id: r.id, members: r.members.map(m => ({ ...m })), tags: r.tags })
    }
  }

  fromShapes.nodes.forEach(n => finalNodes.push(n))
  fromShapes.ways.forEach(w => finalWays.push(w))
  for (const r of fromShapes.relations) finalRelations.push(r)

  let xml = `<?xml version='1.0' encoding='UTF-8'?>\n`
  xml += `<osm version='0.6' generator='drawtonomy' drawtonomy_origin_lat='${formatLatLon(originLat)}' drawtonomy_origin_lon='${formatLatLon(originLon)}'>\n`
  for (const n of finalNodes) xml += nodeToXml(n)
  for (const w of finalWays) xml += wayToXml(w)
  for (const r of finalRelations) xml += relationToXml(r)
  xml += `</osm>\n`
  return xml
}
