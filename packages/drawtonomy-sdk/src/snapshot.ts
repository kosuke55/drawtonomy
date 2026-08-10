// Parse a `.drawtonomy.svg` file (a regular SVG with a base64-encoded
// snapshot embedded in `data-drawtonomy-snapshot`) back into a
// DrawtonomySnapshot. The legacy attribute name `data-drawauto-snapshot`
// is also accepted for backwards compatibility.

import type { DrawtonomySnapshot } from './types.js'

/**
 * Decode a base64-encoded UTF-8 string. Mirrors the encoder used when the
 * editor produces .drawtonomy.svg files: `btoa(unescape(encodeURIComponent(json)))`.
 */
function base64DecodeUtf8(encoded: string): string {
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(encoded)))
  }
  // Node fallback (Buffer is global in Node 18+).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer
  if (buf) {
    return buf.from(encoded, 'base64').toString('utf-8')
  }
  throw new Error('No base64 decoder available in this environment')
}

/**
 * Extract the value of an attribute from the root `<svg>` element of an SVG
 * source string. Used instead of DOMParser so the parser works in plain
 * Node without jsdom.
 */
function extractRootSvgAttribute(svg: string, attrName: string): string | null {
  // Match the opening <svg ...> tag (allow line breaks inside).
  const openTagMatch = svg.match(/<svg\b[^>]*>/)
  if (!openTagMatch) return null
  const openTag = openTagMatch[0]
  const attrRegex = new RegExp(`\\b${attrName}="([^"]*)"`)
  const m = openTag.match(attrRegex)
  return m ? m[1] : null
}

/**
 * Parse a `.drawtonomy.svg` source string and return the embedded
 * DrawtonomySnapshot. Returns `null` if the file is not a drawtonomy SVG
 * (e.g. plain SVG without an embedded snapshot) or the embedded payload is
 * malformed.
 */
export function parseDrawtonomySvg(svgContent: string): DrawtonomySnapshot | null {
  if (!svgContent || typeof svgContent !== 'string') return null

  const encoded =
    extractRootSvgAttribute(svgContent, 'data-drawtonomy-snapshot') ??
    extractRootSvgAttribute(svgContent, 'data-drawauto-snapshot')
  if (!encoded) return null

  try {
    const jsonString = base64DecodeUtf8(encoded)
    const parsed = JSON.parse(jsonString) as DrawtonomySnapshot
    if (!parsed || !Array.isArray(parsed.shapes)) return null
    return parsed
  } catch {
    return null
  }
}
