// Layer 1: document integrity (`xml.*`).
//
// The importer's XML front end recovers what it can from a damaged document:
// a file cut in half parses into however many <road> elements survived the cut
// and reports nothing. That is the single most dangerous silent failure mode in
// the pipeline, because the result looks like a small but valid map.
//
// This layer answers one question before anything else runs: is this the whole
// document? It uses a small tokenizer rather than a parser — the SDK has zero
// runtime dependencies, and matching open tags against a stack is all that is
// needed to distinguish "truncated" from "complete".

import type { OdrFinding } from '../types.js'

export interface XmlIntegrityResult {
  findings: OdrFinding[]
  /**
   * True when the damage makes the later layers meaningless. A truncated or
   * unbalanced document would otherwise generate a cascade of dangling-
   * reference findings that are all artefacts of the missing bytes.
   */
  fatal: boolean
}

/** One token of interest from the scan. */
interface TagToken {
  name: string
  kind: 'open' | 'close' | 'self'
  /** Byte offset of the '<'. */
  offset: number
}

/**
 * Scan the document for element tags, skipping the regions where `<` and `>`
 * are not markup: comments, CDATA sections, processing instructions and
 * DOCTYPE declarations. Returns null when the scan hits an unterminated
 * construct (an unclosed comment/CDATA is itself a truncation symptom).
 */
function scanTags(xml: string): { tokens: TagToken[]; unterminated: string | null } {
  const tokens: TagToken[] = []
  let i = 0
  const n = xml.length

  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) break

    // Non-element constructs.
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      if (end < 0) return { tokens, unterminated: 'comment' }
      i = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9)
      if (end < 0) return { tokens, unterminated: 'CDATA section' }
      i = end + 3
      continue
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2)
      if (end < 0) return { tokens, unterminated: 'processing instruction' }
      i = end + 2
      continue
    }
    if (xml.startsWith('<!', lt)) {
      // DOCTYPE or other declaration; skip to its closing '>' (internal
      // subsets are not used by OpenDRIVE documents in practice).
      const end = xml.indexOf('>', lt + 2)
      if (end < 0) return { tokens, unterminated: 'declaration' }
      i = end + 1
      continue
    }

    // An element tag. Find its '>', respecting quoted attribute values so that
    // a '>' inside an attribute does not end the tag early.
    let j = lt + 1
    let quote: string | null = null
    let gt = -1
    while (j < n) {
      const ch = xml[j]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        gt = j
        break
      }
      j++
    }
    if (gt < 0) return { tokens, unterminated: 'element tag' }

    const raw = xml.slice(lt + 1, gt)
    const isClose = raw.startsWith('/')
    const isSelf = raw.endsWith('/')
    const nameMatch = (isClose ? raw.slice(1) : raw).match(/^\s*([A-Za-z_][\w.\-:]*)/)
    if (nameMatch) {
      tokens.push({
        name: nameMatch[1],
        kind: isClose ? 'close' : isSelf ? 'self' : 'open',
        offset: lt,
      })
    }
    i = gt + 1
  }

  return { tokens, unterminated: null }
}

/** Report the line number (1-based) of a byte offset, for locating damage. */
function lineOf(xml: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < xml.length; i++) {
    if (xml[i] === '\n') line++
  }
  return line
}

export function checkXmlIntegrity(xml: string): XmlIntegrityResult {
  const findings: OdrFinding[] = []

  if (xml.trim().length === 0) {
    findings.push({
      severity: 'error',
      category: 'MAP_DEFECT',
      rule: 'xml.empty',
      message: 'document is empty',
    })
    return { findings, fatal: true }
  }

  const { tokens, unterminated } = scanTags(xml)

  if (unterminated !== null) {
    findings.push({
      severity: 'error',
      category: 'MAP_DEFECT',
      rule: 'xml.truncated',
      message: `document ends inside an unterminated ${unterminated} — it is incomplete`,
    })
    return { findings, fatal: true }
  }

  if (!tokens.some(t => t.name === 'OpenDRIVE' && t.kind === 'open')) {
    findings.push({
      severity: 'error',
      category: 'MAP_DEFECT',
      rule: 'xml.no-root',
      message: 'no <OpenDRIVE> root element found',
    })
    return { findings, fatal: true }
  }

  // Stack match. The first mismatch is reported and the scan stops: after a
  // structural break the remaining stack states are noise.
  const stack: TagToken[] = []
  for (const t of tokens) {
    if (t.kind === 'self') continue
    if (t.kind === 'open') {
      stack.push(t)
      continue
    }
    const top = stack.pop()
    if (!top) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'xml.unbalanced-tags',
        message: `stray closing tag </${t.name}> at line ${lineOf(xml, t.offset)} with no matching open tag`,
      })
      return { findings, fatal: true }
    }
    if (top.name !== t.name) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'xml.unbalanced-tags',
        message: `closing tag </${t.name}> at line ${lineOf(xml, t.offset)} does not match open <${top.name}> at line ${lineOf(xml, top.offset)}`,
      })
      return { findings, fatal: true }
    }
  }

  if (stack.length > 0) {
    // Unclosed elements remaining at EOF: the document stops mid-structure.
    // Name the outermost unclosed element — the innermost is usually a
    // consequence, the outermost tells you how much is missing.
    const outermost = stack[0]
    const names = stack.map(t => `<${t.name}>`).join(' > ')
    findings.push({
      severity: 'error',
      category: 'MAP_DEFECT',
      rule: 'xml.truncated',
      message:
        `document ends with ${stack.length} unclosed element(s) (${names}); ` +
        `<${outermost.name}> opened at line ${lineOf(xml, outermost.offset)} is never closed`,
    })
    return { findings, fatal: true }
  }

  return { findings, fatal: false }
}
