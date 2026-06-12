// OpenDRIVE (.xodr XML) parser.
//
// Parses an OpenDRIVE document into an intermediate model (`OdrMap`) that the
// shape converter (`odrToShapes`) consumes. The parser covers the subset of
// the standard needed to reconstruct the 2D road network:
//   - <header>          : revMajor/revMinor + <geoReference> PROJ string
//   - <road>            : id/name/length/junction, <link>, <planView>
//                         geometries (line/arc/spiral/paramPoly3/poly3),
//                         <lanes> (laneOffset + laneSections with widths and
//                         road marks), minimal <signals>/<objects> records
//   - <junction>        : connections with laneLinks, priorities
//
// Like the Lanelet2 OSM parser, this is hand-written so it works in a plain
// Node runtime without a DOM. When a global `DOMParser` is available (browser
// or jsdom) it is used for robustness; otherwise a regex-based fallback
// parses the same XML subset. Unknown elements are ignored; missing optional
// attributes get defaults; malformed required attributes throw with road id
// context so problems are easy to locate in large files.

// ---------------------------------------------------------------------------
// Intermediate model types
// ---------------------------------------------------------------------------

export interface OdrHeader {
  revMajor: number
  revMinor: number
  /** Raw <geoReference> content (PROJ string), or null when absent. */
  geoReference: string | null
}

interface OdrGeometryBase {
  /** Start position along the road reference line (m). */
  s: number
  /** Inertial start x (m). */
  x: number
  /** Inertial start y (m). */
  y: number
  /** Start heading (rad). */
  hdg: number
  /** Length of the geometry element along the reference line (m). */
  length: number
}

export type OdrGeometry =
  | (OdrGeometryBase & { kind: 'line' })
  | (OdrGeometryBase & { kind: 'arc'; curvature: number })
  | (OdrGeometryBase & { kind: 'spiral'; curvStart: number; curvEnd: number })
  | (OdrGeometryBase & {
      kind: 'paramPoly3'
      aU: number
      bU: number
      cU: number
      dU: number
      aV: number
      bV: number
      cV: number
      dV: number
      pRange: 'arcLength' | 'normalized'
    })
  | (OdrGeometryBase & { kind: 'poly3'; a: number; b: number; c: number; d: number })

/** Cubic polynomial record: value(ds) = a + b*ds + c*ds^2 + d*ds^3. */
export interface OdrCubic {
  a: number
  b: number
  c: number
  d: number
}

/** <laneOffset s a b c d> — lateral shift of the lane reference relative to the road reference line. */
export interface OdrLaneOffset extends OdrCubic {
  s: number
}

/** <width sOffset a b c d> — lane width polynomial, sOffset relative to the lane section start. */
export interface OdrWidth extends OdrCubic {
  sOffset: number
}

export interface OdrRoadMark {
  sOffset: number
  type: string
  color?: string
}

export interface OdrLane {
  /** Signed lane id: positive = left of reference line, negative = right, 0 = center. */
  id: number
  type: string
  level: boolean
  /** Lane ids in the predecessor lane section (or linked road). */
  predecessorIds: number[]
  /** Lane ids in the successor lane section (or linked road). */
  successorIds: number[]
  widths: OdrWidth[]
  roadMarks: OdrRoadMark[]
}

export interface OdrLaneSection {
  s: number
  /** Sorted ascending by id (1, 2, 3, ... = inner to outer). */
  left: OdrLane[]
  center: OdrLane[]
  /** Sorted descending by id (-1, -2, -3, ... = inner to outer). */
  right: OdrLane[]
}

export interface OdrRoadLink {
  elementType: 'road' | 'junction'
  elementId: string
  contactPoint?: 'start' | 'end'
}

/** <validity fromLane toLane> — lane range a signal applies to. */
export interface OdrSignalValidity {
  fromLane: number
  toLane: number
}

/** Minimal signal record (kept for later conversion phases). */
export interface OdrSignal {
  id: string
  s: number
  t: number
  type: string
  subtype: string
  name: string
  /** Physical size (m); 0 when absent. */
  width: number
  height: number
  /** Lane ranges restricting which lanes the signal applies to (empty = all). */
  validity: OdrSignalValidity[]
  /** <userData code value> records attached to the signal (code -> value). */
  userData: Record<string, string>
}

/**
 * <signalReference> record: re-applies a signal defined elsewhere (by id) to
 * this road, optionally restricted to a lane range.
 */
export interface OdrSignalReference {
  id: string
  s: number
  t: number
  validity: OdrSignalValidity[]
}

/** Minimal object record (kept for later conversion phases). */
export interface OdrObject {
  id: string
  s: number
  t: number
  type: string
  subtype?: string
  name: string
  /** Heading relative to the road reference line at `s` (radians). */
  hdg: number
  /** Extent along the object's local u axis (m). */
  length: number
  /** Extent along the object's local v axis (m). */
  width: number
  /** <userData code value> records attached to the object (code -> value). */
  userData: Record<string, string>
}

export interface OdrRoad {
  id: string
  name: string
  length: number
  /** Junction id this road belongs to, or "-1" for a normal road. */
  junction: string
  predecessor?: OdrRoadLink
  successor?: OdrRoadLink
  planView: OdrGeometry[]
  laneOffsets: OdrLaneOffset[]
  laneSections: OdrLaneSection[]
  signals: OdrSignal[]
  signalReferences: OdrSignalReference[]
  objects: OdrObject[]
  /** <userData code value> records attached to the road (code -> value). */
  userData: Record<string, string>
  /** True when an <elevationProfile> with elevation records is present (flattened on import). */
  hasElevation: boolean
  /** True when a <lateralProfile> with superelevation/shape records is present (flattened on import). */
  hasSuperelevation: boolean
}

export interface OdrJunctionLaneLink {
  from: number
  to: number
}

export interface OdrJunctionConnection {
  id: string
  incomingRoad: string
  connectingRoad: string
  contactPoint: 'start' | 'end'
  laneLinks: OdrJunctionLaneLink[]
}

/** <priority> record: right-of-way between two connecting roads of a junction. */
export interface OdrJunctionPriority {
  /** Connecting road id with priority. */
  high: string
  /** Connecting road id that yields. */
  low: string
}

export interface OdrJunction {
  id: string
  name: string
  connections: OdrJunctionConnection[]
  priorities: OdrJunctionPriority[]
}

export interface OdrMap {
  header: OdrHeader
  roads: OdrRoad[]
  junctions: OdrJunction[]
  /** Original XML, captured for sidecar/round-trip workflows. */
  rawXml: string
}

// ---------------------------------------------------------------------------
// Generic XML tree (shared between the DOM path and the regex fallback)
// ---------------------------------------------------------------------------

interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** Concatenated direct text/CDATA content. */
  text: string
}

type DomParserCtor = new () => {
  parseFromString: (input: string, type: string) => Document
}

function getDomParser(): DomParserCtor | null {
  const g = globalThis as unknown as { DOMParser?: DomParserCtor }
  return typeof g.DOMParser === 'function' ? g.DOMParser : null
}

function domToXmlNode(el: Element): XmlNode {
  const attrs: Record<string, string> = {}
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    attrs[a.name] = a.value
  }
  const children: XmlNode[] = []
  let text = ''
  el.childNodes.forEach(child => {
    if (child.nodeType === 1) {
      children.push(domToXmlNode(child as Element))
    } else if (child.nodeType === 3 || child.nodeType === 4) {
      // Text or CDATA section.
      text += child.nodeValue ?? ''
    }
  })
  return { name: el.tagName, attrs, children, text }
}

const ATTR_RE = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    const value = m[2] !== undefined ? m[2] : m[3]
    attrs[m[1]] = decodeXmlEntities(value)
  }
  return attrs
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

function encodeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Minimal XML parser supporting elements, attributes, self-closing tags,
 * nested elements, and text/CDATA content. CDATA sections are converted to
 * entity-escaped text first so their content survives (needed for
 * <geoReference><![CDATA[+proj=...]]></geoReference>).
 */
function parseXmlTreeFallback(xml: string): XmlNode | null {
  const src = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content: string) => encodeXmlText(content))
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')

  const tagRe = /<\/?\s*([a-zA-Z_][\w:.-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?\s*>/g
  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  let lastEnd = 0
  let m: RegExpExecArray | null

  while ((m = tagRe.exec(src)) !== null) {
    // Text between the previous tag and this one belongs to the open element.
    if (m.index > lastEnd && stack.length > 0) {
      const raw = src.slice(lastEnd, m.index)
      if (raw.trim().length > 0) {
        stack[stack.length - 1].text += decodeXmlEntities(raw)
      }
    }
    lastEnd = m.index + m[0].length

    const fullTag = m[0]
    const name = m[1]
    const rest = m[2]
    const isClosing = fullTag.startsWith('</')
    const isSelfClosing = fullTag.endsWith('/>')

    if (isClosing) {
      const top = stack.pop()
      if (!top || top.name !== name) {
        // Tolerate slight mismatches by ignoring stray closers.
        continue
      }
    } else {
      const el: XmlNode = { name, attrs: parseAttributes(rest), children: [], text: '' }
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(el)
      else root = el
      if (!isSelfClosing) stack.push(el)
    }
  }

  return root
}

function parseXmlTree(xml: string): XmlNode | null {
  const DOMParserImpl = getDomParser()
  if (DOMParserImpl) {
    try {
      const doc = new DOMParserImpl().parseFromString(xml, 'text/xml')
      const rootEl = doc.documentElement
      if (rootEl && rootEl.tagName !== 'parsererror') {
        return domToXmlNode(rootEl)
      }
    } catch {
      // Fall through to the hand-rolled parser.
    }
  }
  return parseXmlTreeFallback(xml)
}

// ---------------------------------------------------------------------------
// Model extraction helpers
// ---------------------------------------------------------------------------

function children(el: XmlNode, name: string): XmlNode[] {
  return el.children.filter(c => c.name === name)
}

function child(el: XmlNode, name: string): XmlNode | undefined {
  return el.children.find(c => c.name === name)
}

/** Parse an optional float attribute with a default. */
function numAttr(el: XmlNode, name: string, fallback: number): number {
  const raw = el.attrs[name]
  if (raw === undefined || raw === '') return fallback
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : fallback
}

/** Parse a required float attribute; throw with context when missing or malformed. */
function requireNumAttr(el: XmlNode, name: string, context: string): number {
  const raw = el.attrs[name]
  const v = raw === undefined ? NaN : parseFloat(raw)
  if (!Number.isFinite(v)) {
    throw new Error(`OpenDRIVE parse error: ${context}: missing or malformed attribute "${name}"`)
  }
  return v
}

function requireStrAttr(el: XmlNode, name: string, context: string): string {
  const raw = el.attrs[name]
  if (raw === undefined || raw === '') {
    throw new Error(`OpenDRIVE parse error: ${context}: missing attribute "${name}"`)
  }
  return raw
}

function parseContactPoint(raw: string | undefined): 'start' | 'end' | undefined {
  return raw === 'start' || raw === 'end' ? raw : undefined
}

/** Collect direct <userData code value> children into a code -> value map. */
function parseUserData(el: XmlNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ud of children(el, 'userData')) {
    const code = ud.attrs.code
    if (code === undefined) continue
    out[code] = ud.attrs.value ?? ''
  }
  return out
}

function parseValidity(el: XmlNode): OdrSignalValidity[] {
  return children(el, 'validity').map(v => ({
    fromLane: numAttr(v, 'fromLane', 0),
    toLane: numAttr(v, 'toLane', 0),
  }))
}

function parseRoadLink(el: XmlNode | undefined, context: string): OdrRoadLink | undefined {
  if (!el) return undefined
  const elementId = requireStrAttr(el, 'elementId', context)
  const elementType = el.attrs.elementType === 'junction' ? 'junction' : 'road'
  return { elementType, elementId, contactPoint: parseContactPoint(el.attrs.contactPoint) }
}

function parseGeometry(el: XmlNode, roadId: string): OdrGeometry {
  const ctx = `road ${roadId}, <geometry>`
  const base: OdrGeometryBase = {
    s: requireNumAttr(el, 's', ctx),
    x: requireNumAttr(el, 'x', ctx),
    y: requireNumAttr(el, 'y', ctx),
    hdg: requireNumAttr(el, 'hdg', ctx),
    length: requireNumAttr(el, 'length', ctx),
  }
  const ctxAt = `road ${roadId}, geometry at s=${base.s}`
  for (const prim of el.children) {
    switch (prim.name) {
      case 'line':
        return { ...base, kind: 'line' }
      case 'arc':
        return { ...base, kind: 'arc', curvature: requireNumAttr(prim, 'curvature', ctxAt) }
      case 'spiral':
        return {
          ...base,
          kind: 'spiral',
          curvStart: requireNumAttr(prim, 'curvStart', ctxAt),
          curvEnd: requireNumAttr(prim, 'curvEnd', ctxAt),
        }
      case 'paramPoly3':
        return {
          ...base,
          kind: 'paramPoly3',
          aU: requireNumAttr(prim, 'aU', ctxAt),
          bU: requireNumAttr(prim, 'bU', ctxAt),
          cU: requireNumAttr(prim, 'cU', ctxAt),
          dU: requireNumAttr(prim, 'dU', ctxAt),
          aV: requireNumAttr(prim, 'aV', ctxAt),
          bV: requireNumAttr(prim, 'bV', ctxAt),
          cV: requireNumAttr(prim, 'cV', ctxAt),
          dV: requireNumAttr(prim, 'dV', ctxAt),
          // OpenDRIVE < 1.5 had no pRange attribute; "normalized" is the default.
          pRange: prim.attrs.pRange === 'arcLength' ? 'arcLength' : 'normalized',
        }
      case 'poly3':
        return {
          ...base,
          kind: 'poly3',
          a: requireNumAttr(prim, 'a', ctxAt),
          b: requireNumAttr(prim, 'b', ctxAt),
          c: requireNumAttr(prim, 'c', ctxAt),
          d: requireNumAttr(prim, 'd', ctxAt),
        }
      default:
        // Unknown child element — keep scanning for a supported primitive.
        break
    }
  }
  throw new Error(`OpenDRIVE parse error: ${ctxAt}: no supported geometry primitive (line/arc/spiral/paramPoly3/poly3)`)
}

function parseLane(el: XmlNode, roadId: string): OdrLane {
  const ctx = `road ${roadId}, <lane>`
  const id = requireNumAttr(el, 'id', ctx)
  if (!Number.isInteger(id)) {
    throw new Error(`OpenDRIVE parse error: ${ctx}: lane id "${el.attrs.id}" is not an integer`)
  }
  const linkEl = child(el, 'link')
  const predecessorIds: number[] = []
  const successorIds: number[] = []
  if (linkEl) {
    for (const p of children(linkEl, 'predecessor')) predecessorIds.push(requireNumAttr(p, 'id', ctx))
    for (const s of children(linkEl, 'successor')) successorIds.push(requireNumAttr(s, 'id', ctx))
  }
  const widths: OdrWidth[] = children(el, 'width').map(w => ({
    sOffset: numAttr(w, 'sOffset', 0),
    a: numAttr(w, 'a', 0),
    b: numAttr(w, 'b', 0),
    c: numAttr(w, 'c', 0),
    d: numAttr(w, 'd', 0),
  }))
  widths.sort((a, b) => a.sOffset - b.sOffset)
  const roadMarks: OdrRoadMark[] = children(el, 'roadMark').map(rm => ({
    sOffset: numAttr(rm, 'sOffset', 0),
    type: rm.attrs.type ?? 'none',
    color: rm.attrs.color,
  }))
  roadMarks.sort((a, b) => a.sOffset - b.sOffset)
  return {
    id,
    type: el.attrs.type ?? 'none',
    level: el.attrs.level === 'true',
    predecessorIds,
    successorIds,
    widths,
    roadMarks,
  }
}

function parseLaneSection(el: XmlNode, roadId: string): OdrLaneSection {
  const s = numAttr(el, 's', 0)
  const parseSide = (sideName: 'left' | 'center' | 'right'): OdrLane[] => {
    const sideEl = child(el, sideName)
    if (!sideEl) return []
    return children(sideEl, 'lane').map(l => parseLane(l, roadId))
  }
  const left = parseSide('left')
  const center = parseSide('center')
  const right = parseSide('right')
  // Sort inner-to-outer so cumulative width accumulation walks away from the
  // reference line: left = 1, 2, 3, ...; right = -1, -2, -3, ...
  left.sort((a, b) => a.id - b.id)
  right.sort((a, b) => b.id - a.id)
  return { s, left, center, right }
}

function parseRoad(el: XmlNode): OdrRoad {
  const id = requireStrAttr(el, 'id', '<road>')
  const ctx = `road ${id}`
  const length = requireNumAttr(el, 'length', ctx)

  const linkEl = child(el, 'link')
  const predecessor = linkEl ? parseRoadLink(child(linkEl, 'predecessor'), `${ctx} <predecessor>`) : undefined
  const successor = linkEl ? parseRoadLink(child(linkEl, 'successor'), `${ctx} <successor>`) : undefined

  const planViewEl = child(el, 'planView')
  const planView: OdrGeometry[] = planViewEl ? children(planViewEl, 'geometry').map(g => parseGeometry(g, id)) : []
  planView.sort((a, b) => a.s - b.s)

  const lanesEl = child(el, 'lanes')
  const laneOffsets: OdrLaneOffset[] = lanesEl
    ? children(lanesEl, 'laneOffset').map(lo => ({
        s: numAttr(lo, 's', 0),
        a: numAttr(lo, 'a', 0),
        b: numAttr(lo, 'b', 0),
        c: numAttr(lo, 'c', 0),
        d: numAttr(lo, 'd', 0),
      }))
    : []
  laneOffsets.sort((a, b) => a.s - b.s)
  const laneSections: OdrLaneSection[] = lanesEl
    ? children(lanesEl, 'laneSection').map(ls => parseLaneSection(ls, id))
    : []
  laneSections.sort((a, b) => a.s - b.s)

  const elevationEl = child(el, 'elevationProfile')
  const hasElevation = !!elevationEl && children(elevationEl, 'elevation').some(e => {
    // A single flat elevation record (a=b=c=d=0) carries no height information.
    return numAttr(e, 'a', 0) !== 0 || numAttr(e, 'b', 0) !== 0 || numAttr(e, 'c', 0) !== 0 || numAttr(e, 'd', 0) !== 0
  })
  const lateralEl = child(el, 'lateralProfile')
  const hasSuperelevation =
    !!lateralEl && (children(lateralEl, 'superelevation').length > 0 || children(lateralEl, 'shape').length > 0)

  const signalsEl = child(el, 'signals')
  const signals: OdrSignal[] = signalsEl
    ? children(signalsEl, 'signal').map(sig => ({
        id: sig.attrs.id ?? '',
        s: numAttr(sig, 's', 0),
        t: numAttr(sig, 't', 0),
        type: sig.attrs.type ?? '',
        subtype: sig.attrs.subtype ?? '',
        name: sig.attrs.name ?? '',
        width: numAttr(sig, 'width', 0),
        height: numAttr(sig, 'height', 0),
        validity: parseValidity(sig),
        userData: parseUserData(sig),
      }))
    : []
  const signalReferences: OdrSignalReference[] = signalsEl
    ? children(signalsEl, 'signalReference').map(ref => ({
        id: ref.attrs.id ?? '',
        s: numAttr(ref, 's', 0),
        t: numAttr(ref, 't', 0),
        validity: parseValidity(ref),
      }))
    : []

  const objectsEl = child(el, 'objects')
  const objects: OdrObject[] = objectsEl
    ? children(objectsEl, 'object').map(obj => ({
        id: obj.attrs.id ?? '',
        s: numAttr(obj, 's', 0),
        t: numAttr(obj, 't', 0),
        type: obj.attrs.type ?? '',
        subtype: obj.attrs.subtype,
        name: obj.attrs.name ?? '',
        hdg: numAttr(obj, 'hdg', 0),
        length: numAttr(obj, 'length', 0),
        width: numAttr(obj, 'width', 0),
        userData: parseUserData(obj),
      }))
    : []

  return {
    id,
    name: el.attrs.name ?? '',
    length,
    junction: el.attrs.junction ?? '-1',
    predecessor,
    successor,
    planView,
    laneOffsets,
    laneSections,
    signals,
    signalReferences,
    objects,
    userData: parseUserData(el),
    hasElevation,
    hasSuperelevation,
  }
}

function parseJunction(el: XmlNode): OdrJunction {
  const id = requireStrAttr(el, 'id', '<junction>')
  const connections: OdrJunctionConnection[] = children(el, 'connection').map(conn => {
    const ctx = `junction ${id}, <connection>`
    return {
      id: conn.attrs.id ?? '',
      incomingRoad: requireStrAttr(conn, 'incomingRoad', ctx),
      connectingRoad: requireStrAttr(conn, 'connectingRoad', ctx),
      contactPoint: parseContactPoint(conn.attrs.contactPoint) ?? 'start',
      laneLinks: children(conn, 'laneLink').map(ll => ({
        from: requireNumAttr(ll, 'from', ctx),
        to: requireNumAttr(ll, 'to', ctx),
      })),
    }
  })
  const priorities = children(el, 'priority')
    .map(pr => ({ high: pr.attrs.high ?? '', low: pr.attrs.low ?? '' }))
    .filter(pr => pr.high !== '' && pr.low !== '')
  return { id, name: el.attrs.name ?? '', connections, priorities }
}

/** Parse an OpenDRIVE XML string into the intermediate `OdrMap` model. */
export function parseOpenDriveXml(xmlString: string): OdrMap {
  const root = parseXmlTree(xmlString)
  if (!root || root.name !== 'OpenDRIVE') {
    throw new Error('OpenDRIVE parse error: missing <OpenDRIVE> root element')
  }

  const headerEl = child(root, 'header')
  const geoRefEl = headerEl ? child(headerEl, 'geoReference') : undefined
  const geoReference = geoRefEl ? geoRefEl.text.trim() || null : null
  const header: OdrHeader = {
    revMajor: headerEl ? numAttr(headerEl, 'revMajor', 1) : 1,
    revMinor: headerEl ? numAttr(headerEl, 'revMinor', 0) : 0,
    geoReference,
  }

  const roads = children(root, 'road').map(parseRoad)
  const junctions = children(root, 'junction').map(parseJunction)

  return { header, roads, junctions, rawXml: xmlString }
}
