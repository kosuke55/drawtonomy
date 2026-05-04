// Lanelet2 OSM (.osm XML) parser.
//
// The Lanelet2 format reuses OpenStreetMap's `<node>` / `<way>` / `<relation>`
// tag structure but with traffic-domain semantics:
//   - <node>      : a 2D point in lat/lon (optionally with `ele` tag for height)
//   - <way>       : an ordered list of node refs forming a polyline
//                   (used for lane boundaries, stop lines, etc.)
//   - <relation>  : a typed grouping of ways/nodes
//                   (`type=lanelet` joins a left + right way as a lane;
//                    `type=regulatory_element` etc. are kept untouched)
//
// drawtonomy-emitted files additionally embed `drawtonomy_origin_lat` and
// `drawtonomy_origin_lon` attributes on the root `<osm>` element so that the
// canvas page coordinates can be reconstructed exactly on round-trip. Standard
// OSM consumers ignore unknown attributes, keeping the file compatible.
//
// The parser is intentionally hand-written so it works in a plain Node runtime
// without a DOM. When a global `DOMParser` is available (e.g. in a browser or
// when jsdom is installed), it is used for robustness; otherwise a regex-based
// fallback parses the same subset of OSM XML used by Lanelet2.

export interface OsmNode {
  id: string
  lat: number
  lon: number
  ele?: number
  tags: Record<string, string>
}

export interface OsmWay {
  id: string
  nodeRefs: string[]
  tags: Record<string, string>
}

export interface OsmRelation {
  id: string
  members: { type: string; ref: string; role: string }[]
  tags: Record<string, string>
}

export interface OsmData {
  nodes: Map<string, OsmNode>
  ways: Map<string, OsmWay>
  relations: OsmRelation[]
  /**
   * drawtonomy-emitted `<osm drawtonomy_origin_lat=... drawtonomy_origin_lon=...>`.
   * Honored on import to restore exact page coordinates; absent for files
   * produced by other tools.
   */
  drawtonomyOrigin?: { lat: number; lon: number }
}

type DomParserCtor = new () => {
  parseFromString: (input: string, type: string) => Document
}

function getDomParser(): DomParserCtor | null {
  const g = globalThis as unknown as { DOMParser?: DomParserCtor }
  return typeof g.DOMParser === 'function' ? g.DOMParser : null
}

function parseOsmXmlWithDom(xmlString: string, DOMParserImpl: DomParserCtor): OsmData {
  const parser = new DOMParserImpl()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const nodes = new Map<string, OsmNode>()
  const ways = new Map<string, OsmWay>()
  const relations: OsmRelation[] = []

  let drawtonomyOrigin: { lat: number; lon: number } | undefined
  const osmEl = doc.querySelector('osm')
  if (osmEl) {
    const oLat = parseFloat(osmEl.getAttribute('drawtonomy_origin_lat') || '')
    const oLon = parseFloat(osmEl.getAttribute('drawtonomy_origin_lon') || '')
    if (Number.isFinite(oLat) && Number.isFinite(oLon)) {
      drawtonomyOrigin = { lat: oLat, lon: oLon }
    }
  }

  const collectTags = (el: Element): Record<string, string> => {
    const tags: Record<string, string> = {}
    el.querySelectorAll(':scope > tag').forEach(tagEl => {
      const k = tagEl.getAttribute('k') || ''
      const v = tagEl.getAttribute('v') || ''
      if (k) tags[k] = v
    })
    return tags
  }

  doc.querySelectorAll('node').forEach(nodeEl => {
    const id = nodeEl.getAttribute('id') || ''
    const lat = parseFloat(nodeEl.getAttribute('lat') || '0')
    const lon = parseFloat(nodeEl.getAttribute('lon') || '0')
    const tags = collectTags(nodeEl)
    nodes.set(id, {
      id,
      lat,
      lon,
      ele: tags.ele !== undefined ? parseFloat(tags.ele) : undefined,
      tags,
    })
  })

  doc.querySelectorAll('way').forEach(wayEl => {
    const id = wayEl.getAttribute('id') || ''
    const nodeRefs: string[] = []
    wayEl.querySelectorAll(':scope > nd').forEach(ndEl => {
      const ref = ndEl.getAttribute('ref') || ''
      if (ref) nodeRefs.push(ref)
    })
    ways.set(id, { id, nodeRefs, tags: collectTags(wayEl) })
  })

  doc.querySelectorAll('relation').forEach(relEl => {
    const id = relEl.getAttribute('id') || ''
    const members: OsmRelation['members'] = []
    relEl.querySelectorAll(':scope > member').forEach(memEl => {
      members.push({
        type: memEl.getAttribute('type') || '',
        ref: memEl.getAttribute('ref') || '',
        role: memEl.getAttribute('role') || '',
      })
    })
    // Keep all relations (regulatory_element etc.) so they survive a
    // round-trip; consumers can filter by tag type.
    relations.push({ id, members, tags: collectTags(relEl) })
  })

  return { nodes, ways, relations, drawtonomyOrigin }
}

// ---------- Hand-rolled fallback parser (no DOM dependency) ----------

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

interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
}

/**
 * Minimal XML parser supporting the subset used by Lanelet2 OSM files:
 * elements, attributes, self-closing tags, and nested elements. XML comments
 * and CDATA blocks are stripped first. Sufficient for `<node>`/`<way>`/
 * `<relation>`/`<tag>`/`<nd>`/`<member>`.
 */
function parseXmlSubset(xml: string): XmlElement | null {
  // Strip XML declaration, comments, processing instructions, and CDATA.
  let src = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')

  const tagRe = /<\/?\s*([a-zA-Z_][\w:.-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?\s*>/g
  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let m: RegExpExecArray | null

  while ((m = tagRe.exec(src)) !== null) {
    const fullTag = m[0]
    const name = m[1]
    const rest = m[2]
    const isClosing = fullTag.startsWith('</')
    const isSelfClosing = fullTag.endsWith('/>')

    if (isClosing) {
      // Pop matching element.
      const top = stack.pop()
      if (!top || top.name !== name) {
        // Tolerate slight mismatches by ignoring stray closers.
        continue
      }
    } else {
      const el: XmlElement = { name, attrs: parseAttributes(rest), children: [] }
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(el)
      else root = el
      if (!isSelfClosing) stack.push(el)
    }
  }

  return root
}

function findChildren(el: XmlElement, name: string): XmlElement[] {
  return el.children.filter(c => c.name === name)
}

function collectTagsFromChildren(el: XmlElement): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const c of findChildren(el, 'tag')) {
    const k = c.attrs.k
    const v = c.attrs.v ?? ''
    if (k) tags[k] = v
  }
  return tags
}

function parseOsmXmlFallback(xmlString: string): OsmData {
  const root = parseXmlSubset(xmlString)
  const nodes = new Map<string, OsmNode>()
  const ways = new Map<string, OsmWay>()
  const relations: OsmRelation[] = []
  let drawtonomyOrigin: { lat: number; lon: number } | undefined

  if (!root) return { nodes, ways, relations }

  const osmRoot = root.name === 'osm' ? root : findChildren(root, 'osm')[0]
  if (!osmRoot) return { nodes, ways, relations }

  const oLat = parseFloat(osmRoot.attrs.drawtonomy_origin_lat ?? '')
  const oLon = parseFloat(osmRoot.attrs.drawtonomy_origin_lon ?? '')
  if (Number.isFinite(oLat) && Number.isFinite(oLon)) {
    drawtonomyOrigin = { lat: oLat, lon: oLon }
  }

  for (const child of osmRoot.children) {
    if (child.name === 'node') {
      const id = child.attrs.id ?? ''
      const lat = parseFloat(child.attrs.lat ?? '0')
      const lon = parseFloat(child.attrs.lon ?? '0')
      const tags = collectTagsFromChildren(child)
      nodes.set(id, {
        id,
        lat,
        lon,
        ele: tags.ele !== undefined ? parseFloat(tags.ele) : undefined,
        tags,
      })
    } else if (child.name === 'way') {
      const id = child.attrs.id ?? ''
      const nodeRefs = findChildren(child, 'nd').map(c => c.attrs.ref ?? '').filter(r => r.length > 0)
      ways.set(id, { id, nodeRefs, tags: collectTagsFromChildren(child) })
    } else if (child.name === 'relation') {
      const id = child.attrs.id ?? ''
      const members = findChildren(child, 'member').map(c => ({
        type: c.attrs.type ?? '',
        ref: c.attrs.ref ?? '',
        role: c.attrs.role ?? '',
      }))
      relations.push({ id, members, tags: collectTagsFromChildren(child) })
    }
  }

  return { nodes, ways, relations, drawtonomyOrigin }
}

/** Parse a Lanelet2 OSM XML string into structured data. */
export function parseOsmXml(xmlString: string): OsmData {
  const DOMParserImpl = getDomParser()
  if (DOMParserImpl) {
    try {
      return parseOsmXmlWithDom(xmlString, DOMParserImpl)
    } catch {
      // Fall through to the hand-rolled parser.
    }
  }
  return parseOsmXmlFallback(xmlString)
}

/**
 * Project lat/lon onto canvas (page) coordinates using a simple
 * equirectangular projection centered at (centerLat, centerLon).
 *
 * The default scale matches drawtonomy's visual sizing convention: a 3 m wide
 * lane renders as 50 px (16.67 px/m), so `scale = 16.67 * 111320 ≈ 1,855,000`.
 */
export function latLonToCanvas(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  scale: number = 1_855_000
): { x: number; y: number } {
  const x = (lon - centerLon) * scale * Math.cos((centerLat * Math.PI) / 180)
  // Page Y axis points down, latitude grows northward (= up), so flip.
  const y = -(lat - centerLat) * scale
  return { x, y }
}

/** Inverse of `latLonToCanvas`: page coordinates back to lat/lon. */
export function canvasToLatLon(
  x: number,
  y: number,
  centerLat: number,
  centerLon: number,
  scale: number = 1_855_000
): { lat: number; lon: number } {
  const lat = centerLat - y / scale
  const lon = centerLon + x / (scale * Math.cos((centerLat * Math.PI) / 180))
  return { lat, lon }
}
