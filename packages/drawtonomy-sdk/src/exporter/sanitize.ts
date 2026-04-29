/**
 * Strip characters that are not OS / zip safe from a file base name.
 * - /, \, :, *, ?, ", <, >, |, NUL, control chars → "_"
 * - Runs of whitespace collapse to one space; outer whitespace / dots trim
 * - Empty / "." / ".." returns null (caller falls back to a default name)
 */
export function sanitizeFileBaseName(input: string): string | null {
  if (!input) return null
  let s = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  if (!s) return null
  if (s === '.' || s === '..') return null
  // Reject pointless names made of only underscores / whitespace; the caller
  // falls back to a default name in that case.
  if (/^[_\s]+$/.test(s)) return null
  // Cap length to stay under typical OS filename limits.
  if (s.length > 100) s = s.slice(0, 100)
  return s
}
