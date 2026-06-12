// Carry-through support for OpenDRIVE round trips.
//
// An imported .xodr keeps its original XML in the sidecar. On export, roads
// whose shapes were NOT edited since import are re-emitted verbatim (the
// exact original <road> element text), and only edited roads go through the
// regular fitting exporter. This makes an unedited import -> export round
// trip lossless at the XML level, including features the shape model does
// not represent (elevation profiles, unknown signal types, custom userData).
//
// Two halves live here, shared by the importer and the exporter:
//
// 1. Road state hashing. At import time `odrToShapes` records, per source
//    road, the shape ids it materialized plus a hash over their editable
//    state: boundary point sequences (in travel order), lane attributes,
//    next/prev connectivity, right-of-way links, and every regulatory shape
//    (traffic light / crosswalk) touching the road. At export time the same
//    hash is recomputed from the live shapes; equality means "unedited".
//
// 2. Raw document access. <header> / <road> / <junction> / <controller>
//    elements are extracted from the original XML as verbatim text blocks
//    together with their ids and cross-references (link targets, junction
//    membership, signal definitions), so the exporter can decide what stays
//    verbatim, propagate dirtiness across junctions, keep id spaces
//    collision-free, and rewrite only the link elementIds that must point at
//    regenerated roads — leaving every other byte untouched.

import type { Point2D } from './laneCenterline'

/** Per-road record captured at import time (stored in the sidecar). */
export interface OdrRoadRecord {
  /** Lane shape ids materialized from this road, in materialization order. */
  laneShapeIds: string[]
  /** Hash of the road's editable shape state at import time. */
  stateHash: string
}

/** Editable state of one lane shape, as fed into the road state hash. */
export interface CarryLaneState {
  /** Left boundary points in travel order (canvas px), or null when unusable. */
  leftPts: readonly Point2D[] | null
  rightPts: readonly Point2D[] | null
  attributes: Record<string, string | undefined>
  next: readonly string[]
  prev: readonly string[]
  yieldLaneIds: readonly string[]
}

/** Editable state of a regulatory shape (traffic light / crosswalk). */
export interface CarryRegulatoryState {
  kind: 'traffic_light' | 'crosswalk'
  shapeId: string
  /** Positional numeric fields (position, size, rotation). */
  numbers: readonly number[]
  attributes: Record<string, string | undefined>
  affectedLaneIds: readonly string[]
  stopLinePts: readonly Point2D[] | null
  controllerId: string
}

const fmtPts = (pts: readonly Point2D[] | null): string =>
  pts ? pts.map(p => `${p.x},${p.y}`).join(';') : 'null'

const fmtAttrs = (attrs: Record<string, string | undefined>): string =>
  Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&')

const fmtIds = (ids: readonly string[]): string => [...ids].sort().join(',')

/**
 * Deterministic serialization of a road's editable shape state. Lane order
 * follows the record's laneShapeIds (identical on both sides by
 * construction); regulatory shapes are sorted by shape id.
 */
export function serializeRoadState(
  lanes: readonly CarryLaneState[],
  regulatory: readonly CarryRegulatoryState[]
): string {
  const laneStr = lanes
    .map(
      l =>
        `L:${fmtPts(l.leftPts)}|R:${fmtPts(l.rightPts)}|A:${fmtAttrs(l.attributes)}` +
        `|N:${fmtIds(l.next)}|P:${fmtIds(l.prev)}|Y:${fmtIds(l.yieldLaneIds)}`
    )
    .join('\n')
  const regStr = [...regulatory]
    .sort((a, b) => (a.shapeId < b.shapeId ? -1 : a.shapeId > b.shapeId ? 1 : 0))
    .map(
      r =>
        `${r.kind}:${r.shapeId}|#:${r.numbers.join(',')}|A:${fmtAttrs(r.attributes)}` +
        `|F:${fmtIds(r.affectedLaneIds)}|S:${fmtPts(r.stopLinePts)}|C:${r.controllerId}`
    )
    .join('\n')
  return `${laneStr}\u0000${regStr}`
}

/** Hash of `serializeRoadState` (two independent 32-bit FNV-1a streams). */
export function hashRoadState(
  lanes: readonly CarryLaneState[],
  regulatory: readonly CarryRegulatoryState[]
): string {
  const s = serializeRoadState(lanes, regulatory)
  let a = 0x811c9dc5 | 0
  let b = (0x811c9dc5 ^ 0x5bd1e995) | 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x01000197)
  }
  return (
    (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
  )
}

// ---------------------------------------------------------------------------
// Raw document access
// ---------------------------------------------------------------------------

export interface OdrDocRoad {
  id: string
  /** Junction this road belongs to ("-1" for normal roads). */
  junction: string
  /** Verbatim element text (exact substring of the original XML). */
  text: string
  /** elementIds of road-level <predecessor>/<successor> with elementType="road". */
  linkRoadRefs: string[]
  /** elementIds of road-level links with elementType="junction". */
  linkJunctionRefs: string[]
  /** ids of <signal> definitions inside this road. */
  signalIds: string[]
}

export interface OdrDocJunction {
  id: string
  text: string
  /** incomingRoad / connectingRoad ids referenced by <connection> records. */
  memberRoadIds: string[]
}

export interface OdrDocController {
  id: string
  text: string
  /** signalIds referenced by <control> records. */
  signalIds: string[]
}

export interface OdrDocument {
  headerText: string | null
  roads: OdrDocRoad[]
  junctions: OdrDocJunction[]
  controllers: OdrDocController[]
  /** Largest numeric id over roads / junctions (0 when none are numeric). */
  maxNumericElementId: number
  /** Largest numeric id over <signal>/<signalReference> records. */
  maxNumericSignalId: number
  /** Largest numeric <controller> id. */
  maxNumericControllerId: number
}

/** Match all `<tag .../>` or `<tag ...>...</tag>` blocks (tags do not nest). */
function matchBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*(?:/>|>[\\s\\S]*?</${tag}>)`, 'g')
  return xml.match(re) ?? []
}

/** Attribute value from an element's opening tag, or null. */
function attrOf(block: string, name: string): string | null {
  const end = block.indexOf('>')
  const open = end >= 0 ? block.slice(0, end + 1) : block
  const m = open.match(new RegExp(`\\b${name}="([^"]*)"`))
  return m ? m[1] : null
}

/**
 * Extract the verbatim header / road / junction / controller blocks from an
 * OpenDRIVE document. Returns null when the input does not look like
 * OpenDRIVE XML. Regex block matching is safe here because none of these
 * elements nest within themselves.
 */
export function extractOdrDocument(xml: string): OdrDocument | null {
  if (!/<OpenDRIVE[\s>]/.test(xml)) return null

  const headerMatch = xml.match(/<header\b[^>]*(?:\/>|>[\s\S]*?<\/header>)/)

  const roads: OdrDocRoad[] = []
  for (const text of matchBlocks(xml, 'road')) {
    const id = attrOf(text, 'id')
    if (id === null) continue
    const linkRoadRefs: string[] = []
    const linkJunctionRefs: string[] = []
    for (const tag of text.match(/<(?:predecessor|successor)\b[^>]*\/?>/g) ?? []) {
      const elementType = tag.match(/\belementType="([^"]*)"/)?.[1]
      const elementId = tag.match(/\belementId="([^"]*)"/)?.[1]
      if (elementId === undefined) continue
      if (elementType === 'road') linkRoadRefs.push(elementId)
      else if (elementType === 'junction') linkJunctionRefs.push(elementId)
    }
    const signalIds: string[] = []
    for (const tag of text.match(/<signal\b[^>]*/g) ?? []) {
      const sid = tag.match(/\bid="([^"]*)"/)?.[1]
      if (sid !== undefined) signalIds.push(sid)
    }
    roads.push({
      id,
      junction: attrOf(text, 'junction') ?? '-1',
      text,
      linkRoadRefs,
      linkJunctionRefs,
      signalIds,
    })
  }

  const junctions: OdrDocJunction[] = []
  for (const text of matchBlocks(xml, 'junction')) {
    const id = attrOf(text, 'id')
    if (id === null) continue
    const memberRoadIds: string[] = []
    for (const tag of text.match(/<connection\b[^>]*/g) ?? []) {
      for (const name of ['incomingRoad', 'connectingRoad'] as const) {
        const v = tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
        if (v !== undefined && !memberRoadIds.includes(v)) memberRoadIds.push(v)
      }
    }
    junctions.push({ id, text, memberRoadIds })
  }

  const controllers: OdrDocController[] = []
  for (const text of matchBlocks(xml, 'controller')) {
    const id = attrOf(text, 'id') ?? ''
    const signalIds: string[] = []
    for (const tag of text.match(/<control\b[^>]*/g) ?? []) {
      const sid = tag.match(/\bsignalId="([^"]*)"/)?.[1]
      if (sid !== undefined) signalIds.push(sid)
    }
    controllers.push({ id, text, signalIds })
  }

  const numericMax = (ids: Iterable<string>): number => {
    let max = 0
    for (const id of ids) {
      if (/^\d+$/.test(id)) max = Math.max(max, parseInt(id, 10))
    }
    return max
  }
  const signalRefIds: string[] = []
  for (const tag of xml.match(/<signalReference\b[^>]*/g) ?? []) {
    const sid = tag.match(/\bid="([^"]*)"/)?.[1]
    if (sid !== undefined) signalRefIds.push(sid)
  }

  return {
    headerText: headerMatch ? headerMatch[0] : null,
    roads,
    junctions,
    controllers,
    maxNumericElementId: numericMax([...roads.map(r => r.id), ...junctions.map(j => j.id)]),
    maxNumericSignalId: numericMax([...roads.flatMap(r => r.signalIds), ...signalRefIds]),
    maxNumericControllerId: numericMax(controllers.map(c => c.id)),
  }
}

/**
 * Rewrite the elementId of road-level <predecessor>/<successor> records
 * according to `roadMapping` (elementType="road") and `junctionMapping`
 * (elementType="junction"), each original id -> new id. Every byte outside
 * the rewritten attribute values is preserved.
 */
export function rewriteRoadLinkTargets(
  text: string,
  roadMapping: Map<string, string>,
  junctionMapping: Map<string, string> = new Map()
): string {
  if (roadMapping.size === 0 && junctionMapping.size === 0) return text
  return text.replace(/<(?:predecessor|successor)\b[^>]*\/?>/g, tag => {
    const elementType = tag.match(/\belementType="([^"]*)"/)?.[1]
    const mapping =
      elementType === 'road' ? roadMapping : elementType === 'junction' ? junctionMapping : null
    if (!mapping || mapping.size === 0) return tag
    return tag.replace(/(\belementId=")([^"]*)(")/, (m, pre: string, idv: string, post: string) => {
      const repl = mapping.get(idv)
      return repl !== undefined ? pre + repl + post : m
    })
  })
}
