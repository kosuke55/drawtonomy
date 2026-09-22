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
//    (traffic light / sign / crosswalk) touching the road. At export time the same
//    hash is recomputed from the live shapes; equality means "unedited".
//
// 2. Raw document access. <header> / <road> / <junction> / <controller>
//    elements are extracted from the original XML as verbatim text blocks
//    together with their ids and cross-references (link targets, junction
//    membership, signal definitions), so the exporter can decide what stays
//    verbatim, propagate dirtiness across junctions, keep id spaces
//    collision-free, and rewrite only the link elementIds that must point at
//    regenerated roads — leaving every other byte untouched.

import type { Point2D } from './laneCenterline.js'

/** Per-road record captured at import time (stored in the sidecar). */
export interface OdrRoadRecord {
  /** Lane shape ids materialized from this road, in materialization order. */
  laneShapeIds: string[]
  /** Hash of the road's editable shape state at import time. */
  stateHash: string
  /**
   * Hash of the road's *non-geometric* state only (lane attributes /
   * connectivity / right-of-way and the regulatory shapes, with all boundary
   * and stop-line point sequences removed). When this still matches at export
   * but `stateHash` does not, the edit touched only boundary geometry — the
   * precondition for surgical (lateral-only) width regeneration.
   */
  semanticHash?: string
  /**
   * Hash of the road's state with BOTH the boundary geometry and the whole
   * regulatory layer removed: only lane attributes / connectivity /
   * right-of-way contribute. When this still matches at export but
   * `semanticHash` does not, the edit stayed inside the two layers the
   * surgical path can rewrite in place — lane `<width>` records and the
   * road's `<signal>` elements. `semanticHash` alone cannot say that,
   * because it folds a moved / added / deleted signal into the same value
   * as a renamed lane.
   */
  laneSemanticHash?: string
  /**
   * Hash of the lane side alone, boundary geometry included (the regulatory
   * layer dropped). Equality means the lanes are completely untouched, so a
   * road whose only edit was to its signals keeps its `<lanes>` subtree
   * byte-verbatim instead of going through the width rewrite.
   */
  laneGeometryHash?: string
  /**
   * Hash of the regulatory shapes the road does NOT emit as `<signal>`
   * elements (crosswalks, emitted as `<object>`s). Equality here, together
   * with `laneSemanticHash` equality, is the precondition for the surgical
   * `<signal>` rewrite: everything else that changed is confined to the
   * traffic lights / signs, which `rewriteSignals` checks element by element
   * against the road's original `<signals>` block.
   */
  nonSignalRegulatoryHash?: string
  /**
   * Import-time baseline of each traffic light / sign this road emits as a
   * `<signal>`, keyed by the source `<signal id>`. The surgical `<signal>`
   * rewrite compares the live shape against it to be sure the signal was
   * *moved* and not swapped for a different one (relabelled, re-aimed at other
   * lanes, re-grouped under another controller, given a new stop line), and to
   * tell a moved signal from an untouched one without a tolerance.
   */
  signalBaselines?: Record<string, SignalBaseline>
}

/** Import-time state of one `<signal>`-emitting shape. */
export interface SignalBaseline {
  /** Non-positional payload; see `serializeSignalPayload`. */
  payload: string
  /** Canvas-pixel position, compared by value equality. */
  x: number
  y: number
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

/** Editable state of a regulatory shape (traffic light / sign / crosswalk). */
export interface CarryRegulatoryState {
  kind: 'traffic_light' | 'traffic_sign' | 'crosswalk'
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

/**
 * Hash of a road's non-geometric state: `hashRoadState` with every boundary
 * and stop-line point sequence removed, so only lane attributes /
 * connectivity / right-of-way and the regulatory shapes' identity contribute.
 * Used to detect "geometry changed, everything else unchanged" (the surgical
 * precondition).
 */
export function hashRoadSemantics(
  lanes: readonly CarryLaneState[],
  regulatory: readonly CarryRegulatoryState[]
): string {
  const geomFreeLanes = lanes.map(l => ({ ...l, leftPts: null, rightPts: null }))
  const geomFreeReg = regulatory.map(r => ({ ...r, stopLinePts: null }))
  return hashRoadState(geomFreeLanes, geomFreeReg)
}

/**
 * Hash of a road's lane semantics only: `hashRoadSemantics` with the whole
 * regulatory layer dropped as well. Equality means the lanes' attributes,
 * connectivity and right-of-way are untouched, whatever happened to the
 * boundary geometry and to the signals — the precondition for combining
 * surgical width rewriting with surgical `<signal>` rewriting.
 */
export function hashRoadLaneSemantics(lanes: readonly CarryLaneState[]): string {
  const geomFreeLanes = lanes.map(l => ({ ...l, leftPts: null, rightPts: null }))
  return hashRoadState(geomFreeLanes, [])
}

/**
 * Kinds that a road emits as `<signal>` elements, and whose position the
 * surgical path can therefore rewrite in place. Crosswalks become `<object>`
 * elements instead, so they stay fully hashed.
 */
const SIGNAL_KINDS: ReadonlySet<CarryRegulatoryState['kind']> = new Set([
  'traffic_light',
  'traffic_sign',
])

/**
 * Hash of the regulatory shapes a road does NOT emit as `<signal>` elements
 * (crosswalks, which become `<object>`s). Their full state — membership,
 * position, attributes, stop line — contributes, because nothing in the
 * surgical path can rewrite them in place.
 *
 * The `<signal>` kinds are deliberately left out: the authority on what
 * changed about them is the road's own original `<signals>` block, which
 * `rewriteSignals` matches every live shape against element by element. A
 * hash cannot tell "one signal moved" from "one signal was replaced by a
 * different one", but that comparison can.
 */
export function hashRoadNonSignalRegulatory(regulatory: readonly CarryRegulatoryState[]): string {
  return hashRoadState([], regulatory.filter(r => !SIGNAL_KINDS.has(r.kind)))
}

/** True for the regulatory kinds a road emits as `<signal>` elements. */
export function isSignalKind(kind: CarryRegulatoryState['kind']): boolean {
  return SIGNAL_KINDS.has(kind)
}

/**
 * Everything about a traffic light / sign except where it sits: kind, size,
 * attributes, affected lanes, stop line and controller. Two shapes with the
 * same payload differ only by position, which is what the surgical `<signal>`
 * rewrite can express; any other difference means the signal was replaced, not
 * moved. `numbers[0]` / `numbers[1]` are the position and are excluded;
 * the remaining entries (size, rotation) stay in.
 */
export function serializeSignalPayload(state: CarryRegulatoryState): string {
  return (
    `${state.kind}|#:${state.numbers.slice(2).join(',')}|A:${fmtAttrs(state.attributes)}` +
    `|F:${fmtIds(state.affectedLaneIds)}|S:${fmtPts(state.stopLinePts)}|C:${state.controllerId}`
  )
}

/**
 * Import-time baseline of a signal-kind shape: its non-positional payload plus
 * its canvas-pixel position. The position is compared by value equality at
 * export, so "did this signal move?" is answered by the numbers being the same
 * numbers — never by a tolerance, which would let a small drag rewrite nothing
 * or a rounding difference rewrite an untouched element.
 */
export function signalBaseline(state: CarryRegulatoryState): SignalBaseline {
  return { payload: serializeSignalPayload(state), x: state.numbers[0], y: state.numbers[1] }
}

// ---------------------------------------------------------------------------
// Raw document access
// ---------------------------------------------------------------------------

/** One road-level `<predecessor>`/`<successor>` with elementType="road". */
export interface OdrDocRoadLink {
  /** Which end of THIS road the link sits on. */
  end: 'predecessor' | 'successor'
  /** The road it reaches. */
  elementId: string
  /** Which end of the neighbour it touches, when stated. */
  contactPoint: 'start' | 'end' | null
}

/** One `<connection>` record of a junction, kept structurally. */
export interface OdrDocConnection {
  id: string | null
  incomingRoad: string
  connectingRoad: string
  /** The end of the connecting road the incoming road meets. */
  contactPoint: 'start' | 'end' | null
  laneLinks: { from: number; to: number }[]
}

export interface OdrDocRoad {
  id: string
  /** Junction this road belongs to ("-1" for normal roads). */
  junction: string
  /** Verbatim element text (exact substring of the original XML). */
  text: string
  /** elementIds of road-level <predecessor>/<successor> with elementType="road". */
  linkRoadRefs: string[]
  /** The same links with the end and contact point they state. */
  roadLinks: OdrDocRoadLink[]
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
  /** The `<connection>` records themselves, in document order. */
  connections: OdrDocConnection[]
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

/**
 * Match all `<tag .../>` or `<tag ...>...</tag>` elements (tags do not nest).
 *
 * The attribute run is `[^>]*?` and the two forms are anchored separately, so
 * a self-closing element ends at its OWN `/>`. Written as `[^>]*(?:/>|>…)`,
 * the greedy run walks past the slash of `<a/>` and the `>…</tag>` branch then
 * matches to the NEXT element's closing tag, swallowing two siblings as one.
 *
 * `matchElementsWithIndent` keeps the leading whitespace of the line, for
 * rewrites that delete whole lines.
 */
const elementRe = (tag: string, indent: boolean): RegExp =>
  new RegExp(
    `${indent ? '[^\\S\\n]*' : ''}<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)${indent ? '\\n?' : ''}`,
    'g'
  )

function matchElements(xml: string, tag: string): string[] {
  return xml.match(elementRe(tag, false)) ?? []
}

/** Opening tag of an element block (`<tag ...>` or `<tag .../>`). */
function openingTagOf(block: string): string {
  const end = block.indexOf('>')
  return end >= 0 ? block.slice(0, end + 1) : block
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
  for (const text of matchElements(xml, 'road')) {
    const id = attrOf(text, 'id')
    if (id === null) continue
    const linkRoadRefs: string[] = []
    const roadLinks: OdrDocRoadLink[] = []
    const linkJunctionRefs: string[] = []
    for (const tag of text.match(/<(?:predecessor|successor)\b[^>]*\/?>/g) ?? []) {
      const elementType = tag.match(/\belementType="([^"]*)"/)?.[1]
      const elementId = tag.match(/\belementId="([^"]*)"/)?.[1]
      if (elementId === undefined) continue
      if (elementType === 'road') {
        linkRoadRefs.push(elementId)
        const cp = tag.match(/\bcontactPoint="([^"]*)"/)?.[1]
        roadLinks.push({
          end: tag.startsWith('<successor') ? 'successor' : 'predecessor',
          elementId,
          contactPoint: cp === 'start' || cp === 'end' ? cp : null,
        })
      } else if (elementType === 'junction') linkJunctionRefs.push(elementId)
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
      roadLinks,
      linkJunctionRefs,
      signalIds,
    })
  }

  const junctions: OdrDocJunction[] = []
  for (const text of matchElements(xml, 'junction')) {
    const id = attrOf(text, 'id')
    if (id === null) continue
    const memberRoadIds: string[] = []
    const connections: OdrDocConnection[] = []
    for (const block of matchElements(text, 'connection')) {
      const open = openingTagOf(block)
      for (const name of ['incomingRoad', 'connectingRoad'] as const) {
        const v = open.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
        if (v !== undefined && !memberRoadIds.includes(v)) memberRoadIds.push(v)
      }
      const incomingRoad = open.match(/\bincomingRoad="([^"]*)"/)?.[1]
      const connectingRoad = open.match(/\bconnectingRoad="([^"]*)"/)?.[1]
      if (incomingRoad === undefined || connectingRoad === undefined) continue
      const cp = open.match(/\bcontactPoint="([^"]*)"/)?.[1]
      const laneLinks: { from: number; to: number }[] = []
      for (const link of block.match(/<laneLink\b[^>]*?\/?>/g) ?? []) {
        const from = parseInt(link.match(/\bfrom="([^"]*)"/)?.[1] ?? '', 10)
        const to = parseInt(link.match(/\bto="([^"]*)"/)?.[1] ?? '', 10)
        if (Number.isFinite(from) && Number.isFinite(to)) laneLinks.push({ from, to })
      }
      connections.push({
        id: open.match(/\bid="([^"]*)"/)?.[1] ?? null,
        incomingRoad,
        connectingRoad,
        contactPoint: cp === 'start' || cp === 'end' ? cp : null,
        laneLinks,
      })
    }
    junctions.push({ id, text, memberRoadIds, connections })
  }

  const controllers: OdrDocController[] = []
  for (const text of matchElements(xml, 'controller')) {
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
 * Drop `<control>` records from a `<controller>` element whose signalId is not
 * in `keepSignalIds`, keeping every other byte (including the controller's own
 * attributes and any unrelated children) untouched.
 *
 * Used when only some of a controller's signals survive as verbatim: the
 * controller stays, minus the entries whose signals were regenerated.
 */
export function dropControlRecords(text: string, keepSignalIds: ReadonlySet<string>): string {
  return text.replace(/[^\S\n]*<control\b[^>]*\/?>\n?/g, match => {
    const sid = match.match(/\bsignalId="([^"]*)"/)?.[1]
    if (sid === undefined) return match
    return keepSignalIds.has(sid) ? match : ''
  })
}

/**
 * Re-point or drop the `<signalReference>` records of a `<road>` element,
 * keeping every other byte untouched.
 *
 * A `<signalReference>` re-applies a signal DEFINED on another road, and
 * carries its own placement (s / t / orientation / validity) for this road,
 * which exists nowhere else. `resolve` is asked what became of each
 * referenced id: a new id to point at, or null when the signal is defined
 * nowhere in the output and the record has to go.
 *
 * Both answers matter. Treating "not in the carried text" as "deleted" threw
 * away references to signals that had merely been re-emitted under a fresh
 * id, taking their placement with them.
 *
 * Each record is matched up to its own end (see `elementRe`): a self-closing
 * `<signalReference .../>` followed by a sibling with a `<validity>` child
 * used to match as ONE record, so the first id decided keep / retarget / drop
 * for both — deleting a reference the user had not touched, or leaving the
 * second id un-retargeted and dangling.
 */
export function rewriteSignalReferences(
  text: string,
  resolve: (signalId: string) => string | null
): string {
  return text.replace(elementRe('signalReference', true), match => {
    const head = openingTagOf(match)
    const sid = head.match(/\bid="([^"]*)"/)?.[1]
    if (sid === undefined) return match
    const target = resolve(sid)
    if (target === null) return ''
    if (target === sid) return match
    return match.replace(head, head.replace(/(\bid=")[^"]*(")/, `$1${target}$2`))
  })
}

/**
 * Append `<control signalId="..."/>` records to a `<controller>` element,
 * just before its closing tag, keeping every existing byte intact.
 *
 * Used when signals of a controller's group were regenerated under fresh ids:
 * the surviving controller element absorbs them instead of a duplicate
 * controller being emitted for the same group.
 */
export function appendControlRecords(text: string, signalIds: readonly number[]): string {
  if (signalIds.length === 0) return text
  const added = signalIds.map(id => `    <control signalId="${id}" type="0"/>`).join('\n')
  // Self-closing <controller .../> has no children yet; expand it.
  if (/\/>\s*$/.test(text)) {
    return `${text.replace(/\s*\/>\s*$/, '>')}\n${added}\n  </controller>`
  }
  const close = text.lastIndexOf('</controller>')
  if (close < 0) return text
  return `${text.slice(0, close)}${added}\n  ${text.slice(close)}`
}

/**
 * Rewrite the elementId of road-level <predecessor>/<successor> records
 * according to `roadMapping` (elementType="road") and `junctionMapping`
 * (elementType="junction"), each original id -> new id. Every byte outside
 * the rewritten attribute values is preserved.
 */
/**
 * Re-point a carried `<road>`'s own `junction` attribute at `junctionId`,
 * leaving every other byte alone.
 *
 * A connecting road the export keeps verbatim while its junction is rebuilt
 * has to say which junction it belongs to now; the `<link>` rewrite above
 * only reaches the predecessor / successor references.
 */
/**
 * Re-point or drop the `<controller>` references inside a carried
 * `<junction>` element, keeping every other byte untouched.
 *
 * A `<junction>` may list the controllers that run its signal groups, by id.
 * Carrying the element verbatim keeps those ids, but a controller can be
 * emitted under a different id (its group regenerated) or not at all (every
 * signal it controlled was deleted). `mapping` says which, keyed by the
 * ORIGINAL id; an id it does not mention is emitted nowhere, so the reference
 * is removed rather than left dangling.
 */
export function rewriteJunctionControllerRefs(
  text: string,
  mapping: ReadonlyMap<string, string>
): string {
  return text.replace(
    /[^\S\n]*<controller\b[^>]*?(?:\/>|>[\s\S]*?<\/controller>)\n?/g,
    match => {
      const head = match.slice(0, match.indexOf('>') + 1)
      const id = head.match(/\bid="([^"]*)"/)?.[1]
      if (id === undefined) return match
      const target = mapping.get(id)
      if (target === undefined) return ''
      if (target === id) return match
      return match.replace(head, head.replace(/(\bid=")[^"]*(")/, `$1${target}$2`))
    }
  )
}

export function rewriteRoadJunctionAttribute(text: string, junctionId: string): string {
  return text.replace(/<road\b[^>]*>/, tag =>
    tag.replace(/(\bjunction=")([^"]*)(")/, (m, pre: string, _id: string, post: string) =>
      pre + junctionId + post
    )
  )
}

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
