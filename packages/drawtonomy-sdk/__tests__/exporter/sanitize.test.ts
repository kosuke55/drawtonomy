import { describe, it, expect } from 'vitest'
import { sanitizeFileBaseName } from '../../src/exporter/sanitize'

describe('sanitizeFileBaseName', () => {
  it('passes through plain ASCII names', () => {
    expect(sanitizeFileBaseName('my-scene')).toBe('my-scene')
    expect(sanitizeFileBaseName('Scenario_01')).toBe('Scenario_01')
  })

  it('preserves multibyte (Japanese) characters', () => {
    expect(sanitizeFileBaseName('交差点シナリオ')).toBe('交差点シナリオ')
  })

  it('replaces path separators and shell-unsafe characters with _', () => {
    expect(sanitizeFileBaseName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('strips control characters', () => {
    expect(sanitizeFileBaseName('hello\x00\x1fworld')).toBe('hello__world')
  })

  it('collapses runs of whitespace and trims edges', () => {
    expect(sanitizeFileBaseName('  hello   world  ')).toBe('hello world')
  })

  it('removes leading/trailing dots', () => {
    expect(sanitizeFileBaseName('...scene...')).toBe('scene')
  })

  it('returns null for empty / dot-only / whitespace-only input', () => {
    expect(sanitizeFileBaseName('')).toBeNull()
    expect(sanitizeFileBaseName('.')).toBeNull()
    expect(sanitizeFileBaseName('..')).toBeNull()
    expect(sanitizeFileBaseName('   ')).toBeNull()
    expect(sanitizeFileBaseName('////')).toBeNull()
  })

  it('truncates excessively long names to 100 chars', () => {
    const long = 'a'.repeat(200)
    const out = sanitizeFileBaseName(long)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(100)
  })
})
