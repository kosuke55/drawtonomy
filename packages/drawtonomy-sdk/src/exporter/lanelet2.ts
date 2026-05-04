// Lanelet2 (.osm XML) exporter — emits an OSM document from a snapshot.
// No external library dependencies.
//
// Behavior summary:
// - Each PointShape becomes a `<node>`
// - Each LinestringShape becomes a `<way>` referencing its point nodes
// - Each LaneShape becomes a `<relation type=lanelet>` referencing its
//   left/right way as members
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
  DrawtonomySnapshot,
  LaneProps,
  LinestringProps,
  PointProps,
} from '../types'
import { canvasToLatLon, parseOsmXml, type OsmData } from './osmParser'

type LaneShape = BaseShape<'lane', LaneProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>

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
  for (const s of shapes) {
    if (s.type === 'point') points.push(s as unknown as PointShape)
    else if (s.type === 'linestring') linestrings.push(s as unknown as LinestringShape)
    else if (s.type === 'lane') lanes.push(s as unknown as LaneShape)
  }

  const nodesOut = new Map<string, NodeOut>()
  const waysOut = new Map<string, WayOut>()
  const relationsOut: RelationOut[] = []

  const shapeNodeOsmIds = new Set<string>()
  const shapeWayOsmIds = new Set<string>()
  const shapeRelationOsmIds = new Set<string>()

  // Resolve a shape -> OSM ID. Empty `osmId` (newly drawn shape) gets a fresh
  // negative ID, matching the OSM convention for unsubmitted edits.
  let nextNewId = -1
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
    const ele = original?.ele
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
    relationsOut.push({ id: osmId, members, tags })
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
