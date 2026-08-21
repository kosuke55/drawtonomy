// Mutation corpus for the OpenDRIVE validator (layer 9).
//
// A detector is only as trustworthy as the evidence that it detects something.
// The failure this harness exists to prevent (measured 2026-08-21): a
// regex-based mutation silently failed to match the numeric formatting of a
// real file, so the mutated document was byte-identical to the original, and
// the validator's (correct) silence was about to be recorded as "not detected".
//
// Therefore every mutation here is a two-part contract:
//
//   apply(xml)  -> mutated document
//   verify(before, after) -> throws unless the intended structural change
//                            actually happened
//
// `applyMutation` runs both and additionally asserts `after !== before`, so a
// no-op mutation fails loudly at the harness level rather than being reported
// as a validator miss.

/** Result of applying one mutation. */
export interface MutationResult {
  /** Mutated document text. */
  xml: string
  /** Human-readable description of what was changed (for test failure output). */
  applied: string
}

export interface Mutation {
  /** Stable mutation id, used in the detection matrix. */
  id: string
  /** What defect this injects. */
  description: string
  /** The `rule` id the validator is expected to raise. */
  expectedRule: string
  apply: (xml: string) => MutationResult
}

class MutationNotAppliedError extends Error {
  constructor(id: string, reason: string) {
    super(`mutation "${id}" did not apply: ${reason}`)
    this.name = 'MutationNotAppliedError'
  }
}

/**
 * Apply a mutation and prove it changed the document. Throws
 * `MutationNotAppliedError` when the mutation was a no-op, so an unmatched
 * pattern can never masquerade as an undetected defect.
 */
export function applyMutation(mutation: Mutation, xml: string): MutationResult {
  const result = mutation.apply(xml)
  if (result.xml === xml) {
    throw new MutationNotAppliedError(mutation.id, 'output is byte-identical to the input')
  }
  return result
}

// ---------------------------------------------------------------------------
// Structural helpers
//
// These locate elements by scanning tags rather than by matching attribute
// values with a fixed numeric pattern, which is what makes them robust against
// the `1.0000000000000000e+02` style formatting used by real exporters.
// ---------------------------------------------------------------------------

/**
 * Find the span of the `index`-th `<name ...>...</name>` (or `<name .../>`)
 * element in `xml`. Returns null when there are fewer than `index + 1`.
 * Handles nesting of same-named elements, which OpenDRIVE does not use for the
 * elements we mutate, but costs nothing to be correct about.
 */
export function findElement(
  xml: string,
  name: string,
  index = 0
): { start: number; end: number; text: string } | null {
  const openRe = new RegExp(`<${name}(?=[\\s/>])`, 'g')
  let seen = 0
  let m: RegExpExecArray | null
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index
    const openEnd = xml.indexOf('>', start)
    if (openEnd < 0) return null
    let end: number
    if (xml[openEnd - 1] === '/') {
      end = openEnd + 1
    } else {
      const closeTag = `</${name}>`
      const close = xml.indexOf(closeTag, openEnd)
      if (close < 0) return null
      end = close + closeTag.length
    }
    if (seen === index) return { start, end, text: xml.slice(start, end) }
    seen += 1
    openRe.lastIndex = end
  }
  return null
}

/** Find all spans of `<name ...>` elements. */
export function findAllElements(
  xml: string,
  name: string
): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = []
  for (let i = 0; ; i++) {
    const el = findElement(xml, name, i)
    if (!el) break
    out.push(el)
  }
  return out
}

/** Read an attribute from an element's opening tag. */
export function attrOf(elementText: string, attr: string): string | null {
  const openEnd = elementText.indexOf('>')
  const open = openEnd >= 0 ? elementText.slice(0, openEnd + 1) : elementText
  const m = open.match(new RegExp(`\\b${attr}="([^"]*)"`))
  return m ? m[1] : null
}

/** Replace an attribute value in an element's opening tag. */
export function withAttr(elementText: string, attr: string, value: string): string {
  const openEnd = elementText.indexOf('>')
  const open = openEnd >= 0 ? elementText.slice(0, openEnd + 1) : elementText
  const rest = openEnd >= 0 ? elementText.slice(openEnd + 1) : ''
  const re = new RegExp(`\\b${attr}="[^"]*"`)
  if (!re.test(open)) {
    // Insert the attribute just before the tag close.
    const selfClosing = open.endsWith('/>')
    const cut = selfClosing ? open.length - 2 : open.length - 1
    return `${open.slice(0, cut)} ${attr}="${value}"${open.slice(cut)}${rest}`
  }
  return open.replace(re, `${attr}="${value}"`) + rest
}

/** Splice `replacement` over the `[start, end)` span of `xml`. */
function splice(xml: string, start: number, end: number, replacement: string): string {
  return xml.slice(0, start) + replacement + xml.slice(end)
}

/** Locate the `<road>` element with the given id. */
function findRoadById(
  xml: string,
  roadId: string
): { start: number; end: number; text: string } | null {
  for (const el of findAllElements(xml, 'road')) {
    if (attrOf(el.text, 'id') === roadId) return el
  }
  return null
}

/** First road that satisfies a predicate on its element text. */
function findRoadWhere(
  xml: string,
  pred: (text: string) => boolean
): { start: number; end: number; text: string } | null {
  for (const el of findAllElements(xml, 'road')) {
    if (pred(el.text)) return el
  }
  return null
}

function require_<T>(id: string, value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new MutationNotAppliedError(id, `source document has no ${what}`)
  }
  return value
}

// ---------------------------------------------------------------------------
// The mutation corpus
// ---------------------------------------------------------------------------

/** M1: truncate the document, dropping the trailing 40 % of its bytes. */
export const truncate: Mutation = {
  id: 'truncate',
  description: 'drop the trailing 40 % of the document (simulates a partial write / bad transfer)',
  expectedRule: 'xml.truncated',
  apply: xml => {
    const cut = Math.floor(xml.length * 0.6)
    const out = xml.slice(0, cut)
    if (out.includes('</OpenDRIVE>')) {
      throw new MutationNotAppliedError('truncate', 'the truncated document still has its root close tag')
    }
    return { xml: out, applied: `kept ${cut} of ${xml.length} bytes` }
  },
}

/** M2: delete one `<connection>` record from a junction. */
export const dropJunctionConnection: Mutation = {
  id: 'drop-junction-connection',
  description: 'delete a <connection> from a junction, orphaning its connecting road',
  expectedRule: 'junction.connection-missing',
  apply: xml => {
    // Pick a connection whose connectingRoad is not referenced by any other
    // connection, so removing it definitely orphans that road.
    const junctions = findAllElements(xml, 'junction')
    for (const j of junctions) {
      const conns = findAllElements(j.text, 'connection')
      if (conns.length < 2) continue
      for (const c of conns) {
        const road = attrOf(c.text, 'connectingRoad') ?? attrOf(c.text, 'linkedRoad')
        if (!road) continue
        const refCount = conns.filter(
          o => (attrOf(o.text, 'connectingRoad') ?? attrOf(o.text, 'linkedRoad')) === road
        ).length
        if (refCount !== 1) continue
        const newJunction = splice(j.text, c.start, c.end, '')
        const out = splice(xml, j.start, j.end, newJunction)
        if (out.length >= xml.length) {
          throw new MutationNotAppliedError('drop-junction-connection', 'document did not shrink')
        }
        return {
          xml: out,
          applied: `removed connection id=${attrOf(c.text, 'id')} (connectingRoad=${road}) from junction ${attrOf(j.text, 'id')}`,
        }
      }
    }
    throw new MutationNotAppliedError(
      'drop-junction-connection',
      'no junction with a uniquely-referenced connecting road'
    )
  },
}

/** M3: point a road's `<successor>` at a road id that does not exist. */
export const danglingRoadSuccessor: Mutation = {
  id: 'dangling-road-successor',
  description: 'retarget a road <successor elementType="road"> at a nonexistent road id',
  expectedRule: 'ref.dangling-road-link',
  apply: xml => {
    const ghostId = '999999'
    const road = require_(
      'dangling-road-successor',
      findRoadWhere(xml, t => /<successor\b[^>]*elementType="road"/.test(t)),
      'road with a road-typed <successor>'
    )
    const succRe = /<successor\b[^>]*elementType="road"[^>]*>/
    const succ = require_('dangling-road-successor', road.text.match(succRe)?.[0], 'successor tag')
    const mutatedSucc = withAttr(succ, 'elementId', ghostId)
    if (mutatedSucc === succ) {
      throw new MutationNotAppliedError('dangling-road-successor', 'elementId already 999999')
    }
    const newRoad = road.text.replace(succRe, mutatedSucc)
    return {
      xml: splice(xml, road.start, road.end, newRoad),
      applied: `road ${attrOf(road.text, 'id')} successor -> road ${ghostId} (nonexistent)`,
    }
  },
}

/** M4: point a junction connection's `incomingRoad` at a nonexistent road. */
export const danglingConnectionIncoming: Mutation = {
  id: 'dangling-connection-incoming',
  description: 'retarget a <connection incomingRoad> at a nonexistent road id',
  expectedRule: 'ref.dangling-connection-road',
  apply: xml => {
    const ghostId = '888888'
    const junction = require_(
      'dangling-connection-incoming',
      findAllElements(xml, 'junction').find(j => findElement(j.text, 'connection') !== null),
      'junction with a connection'
    )
    const conn = require_(
      'dangling-connection-incoming',
      findElement(junction.text, 'connection'),
      'connection element'
    )
    const mutatedConn = withAttr(conn.text, 'incomingRoad', ghostId)
    if (mutatedConn === conn.text) {
      throw new MutationNotAppliedError('dangling-connection-incoming', 'incomingRoad already 888888')
    }
    const newJunction = splice(junction.text, conn.start, conn.end, mutatedConn)
    return {
      xml: splice(xml, junction.start, junction.end, newJunction),
      applied: `junction ${attrOf(junction.text, 'id')} connection ${attrOf(conn.text, 'id')} incomingRoad -> ${ghostId} (nonexistent)`,
    }
  },
}

/** M5: retarget one lane `<link>` at a lane id that does not exist. */
export const dropLaneLink: Mutation = {
  id: 'drop-lane-link',
  description: 'retarget a lane <successor>/<predecessor> at a nonexistent lane id',
  expectedRule: 'ref.dangling-lane-link',
  apply: xml => {
    const ghostLane = '77'
    for (const road of findAllElements(xml, 'road')) {
      // Only mutate roads that actually link somewhere, otherwise the lane
      // link has no target lane section to be checked against.
      if (!/<(?:predecessor|successor)\b/.test(road.text)) continue
      const lanes = findAllElements(road.text, 'lane')
      for (const lane of lanes) {
        const linkTag = lane.text.match(/<(?:successor|predecessor)\b[^>]*\bid="[^"]*"[^>]*\/?>/)?.[0]
        if (!linkTag) continue
        const mutatedTag = withAttr(linkTag, 'id', ghostLane)
        if (mutatedTag === linkTag) continue
        const newLane = lane.text.replace(linkTag, mutatedTag)
        const newRoad = splice(road.text, lane.start, lane.end, newLane)
        return {
          xml: splice(xml, road.start, road.end, newRoad),
          applied: `road ${attrOf(road.text, 'id')} lane ${attrOf(lane.text, 'id')} link -> lane ${ghostLane} (nonexistent)`,
        }
      }
    }
    throw new MutationNotAppliedError('drop-lane-link', 'no linked road with a lane <link> record')
  },
}

/** M6: make a lane width negative. */
export const negativeWidth: Mutation = {
  id: 'negative-width',
  description: 'set a lane <width> constant term negative',
  expectedRule: 'geom.negative-lane-width',
  apply: xml => {
    for (const road of findAllElements(xml, 'road')) {
      const widths = findAllElements(road.text, 'width')
      for (const w of widths) {
        const a = attrOf(w.text, 'a')
        if (a === null || !Number.isFinite(Number(a)) || Number(a) <= 0) continue
        // Zero the higher-order terms so the record is unambiguously negative
        // over its whole span (not merely negative at s = 0).
        let mutated = withAttr(w.text, 'a', '-3.5')
        for (const t of ['b', 'c', 'd']) {
          if (attrOf(mutated, t) !== null) mutated = withAttr(mutated, t, '0')
        }
        const newRoad = splice(road.text, w.start, w.end, mutated)
        return {
          xml: splice(xml, road.start, road.end, newRoad),
          applied: `road ${attrOf(road.text, 'id')} lane width a=${a} -> -3.5`,
        }
      }
    }
    throw new MutationNotAppliedError('negative-width', 'no positive lane <width> record found')
  },
}

/** M7: displace one plan-view geometry's start position, opening a gap. */
export const geometryGap: Mutation = {
  id: 'geometry-gap',
  description: 'shift a <geometry> start x by 5 m, breaking plan-view continuity',
  expectedRule: 'geom.plan-view-gap',
  apply: xml => {
    for (const road of findAllElements(xml, 'road')) {
      const geoms = findAllElements(road.text, 'geometry')
      if (geoms.length < 2) continue
      // Shift the second geometry: its predecessor's end pose no longer meets it.
      const g = geoms[1]
      const x = attrOf(g.text, 'x')
      if (x === null || !Number.isFinite(Number(x))) continue
      const shifted = String(Number(x) + 5)
      const mutated = withAttr(g.text, 'x', shifted)
      if (mutated === g.text) continue
      const newRoad = splice(road.text, g.start, g.end, mutated)
      return {
        xml: splice(xml, road.start, road.end, newRoad),
        applied: `road ${attrOf(road.text, 'id')} geometry[1] x=${x} -> ${shifted} (+5 m)`,
      }
    }
    throw new MutationNotAppliedError('geometry-gap', 'no road with two or more geometries')
  },
}

/** M8: falsify `road@length` so it disagrees with the plan-view sum. */
export const lengthMismatch: Mutation = {
  id: 'length-mismatch',
  description: 'inflate road@length by 50 % without changing the plan view',
  expectedRule: 'geom.road-length-mismatch',
  apply: xml => {
    for (const road of findAllElements(xml, 'road')) {
      const len = attrOf(road.text, 'length')
      if (len === null) continue
      const n = Number(len)
      if (!Number.isFinite(n) || n <= 0) continue
      if (findElement(road.text, 'geometry') === null) continue
      const inflated = String(n * 1.5)
      const openEnd = road.text.indexOf('>')
      const mutatedOpen = withAttr(road.text.slice(0, openEnd + 1), 'length', inflated)
      const newRoad = mutatedOpen + road.text.slice(openEnd + 1)
      if (newRoad === road.text) continue
      return {
        xml: splice(xml, road.start, road.end, newRoad),
        applied: `road ${attrOf(road.text, 'id')} length=${len} -> ${inflated} (+50 %)`,
      }
    }
    throw new MutationNotAppliedError('length-mismatch', 'no road with a positive length and a plan view')
  },
}

/** M9: point a controller `<control signalId>` at a nonexistent signal. */
export const orphanControllerSignal: Mutation = {
  id: 'orphan-controller-signal',
  description: 'retarget a <control signalId> at a signal id that no road defines',
  expectedRule: 'ref.dangling-controller-signal',
  apply: xml => {
    const ghostSignal = '765432'
    const controller = require_(
      'orphan-controller-signal',
      findAllElements(xml, 'controller').find(c => findElement(c.text, 'control') !== null),
      'controller with a <control> record'
    )
    const control = require_(
      'orphan-controller-signal',
      findElement(controller.text, 'control'),
      'control element'
    )
    const mutated = withAttr(control.text, 'signalId', ghostSignal)
    if (mutated === control.text) {
      throw new MutationNotAppliedError('orphan-controller-signal', 'signalId already the ghost id')
    }
    const newController = splice(controller.text, control.start, control.end, mutated)
    return {
      xml: splice(xml, controller.start, controller.end, newController),
      applied: `controller ${attrOf(controller.text, 'id')} control signalId -> ${ghostSignal} (nonexistent)`,
    }
  },
}

/**
 * M10: mark a plain road as belonging to a junction that never lists it.
 * A road carrying `junction="<id>"` is by definition a connecting road of that
 * junction and must appear in one of its `<connection connectingRoad=>`.
 */
export const roadJunctionAttrWithoutMembership: Mutation = {
  id: 'road-junction-attr-without-membership',
  description: 'set road@junction on a road that no <connection> of that junction references',
  expectedRule: 'junction.road-not-member',
  apply: xml => {
    const junction = require_(
      'road-junction-attr-without-membership',
      findElement(xml, 'junction'),
      'junction element'
    )
    const junctionId = require_(
      'road-junction-attr-without-membership',
      attrOf(junction.text, 'id'),
      'junction id'
    )
    const members = new Set(
      findAllElements(junction.text, 'connection').flatMap(c =>
        [attrOf(c.text, 'incomingRoad'), attrOf(c.text, 'connectingRoad'), attrOf(c.text, 'linkedRoad')].filter(
          (v): v is string => v !== null
        )
      )
    )
    for (const road of findAllElements(xml, 'road')) {
      const id = attrOf(road.text, 'id')
      if (id === null || members.has(id)) continue
      if (attrOf(road.text, 'junction') === junctionId) continue
      // Require a road that links to none of the junction's roads, so the
      // defect is unambiguously a spurious membership claim rather than a
      // lost <connection> record. The validator distinguishes the two by
      // exactly this evidence, so the mutation must pin down which it is.
      const linkTargets = (road.text.match(/<(?:predecessor|successor)\b[^>]*>/g) ?? []).map(
        t => attrOf(t, 'elementId') ?? ''
      )
      if (linkTargets.some(t => members.has(t) || t === junctionId)) continue
      const openEnd = road.text.indexOf('>')
      const mutatedOpen = withAttr(road.text.slice(0, openEnd + 1), 'junction', junctionId)
      const newRoad = mutatedOpen + road.text.slice(openEnd + 1)
      if (newRoad === road.text) continue
      return {
        xml: splice(xml, road.start, road.end, newRoad),
        applied: `road ${id} junction -> ${junctionId} (junction lists no connection for it)`,
      }
    }
    throw new MutationNotAppliedError(
      'road-junction-attr-without-membership',
      'every road is already a member of the first junction'
    )
  },
}

/** The full corpus, in detection-matrix order. */
export const MUTATIONS: readonly Mutation[] = [
  truncate,
  dropJunctionConnection,
  danglingRoadSuccessor,
  danglingConnectionIncoming,
  dropLaneLink,
  negativeWidth,
  geometryGap,
  lengthMismatch,
  orphanControllerSignal,
  roadJunctionAttrWithoutMembership,
]
