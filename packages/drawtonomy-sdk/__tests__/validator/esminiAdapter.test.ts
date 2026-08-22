// Layer 6 unit tests: the external road-manager adapter.
//
// The binary is not assumed to exist. These tests drive the parser with
// captured output, which is the whole reason the spawning lives in the CLI and
// only the text handling lives in src/.

import { describe, it, expect } from 'vitest'
import { parseEsminiOutput, esminiSkipped, validateOpenDrive } from '../../src/validator/index'
import { readFixture } from './corpus'

describe('parseEsminiOutput', () => {
  it('reports a clean run', () => {
    const found = parseEsminiOutput({ stdout: 'Loading odr\nOpenDRIVE loaded\n', exitCode: 0 })
    expect(found.map(f => f.rule)).toEqual(['esmini.clean'])
    expect(found[0].severity).toBe('info')
  })

  it('picks error lines out of the chatter', () => {
    const found = parseEsminiOutput({
      stdout: 'Loading odr\n',
      stderr: 'Error: Failed to locate road 5\n',
      exitCode: 1,
    })
    expect(found.map(f => f.rule)).toEqual(['esmini.error'])
    expect(found[0].message).toContain('road 5')
  })

  it('recognizes a missing connection', () => {
    const found = parseEsminiOutput({ stderr: 'No connection from road 1 to road 2\n' })
    expect(found.map(f => f.rule)).toEqual(['esmini.no-connection'])
  })

  it('collapses repeated lines with a count', () => {
    const line = 'Error: lane link missing\n'
    const found = parseEsminiOutput({ stderr: line.repeat(50), exitCode: 1 })
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('(x50)')
  })

  it('keeps the full text of a line', () => {
    // Regression: an early version keyed findings by "<rule> <line>" and then
    // recovered the line by splitting on a space, truncating every message to
    // its first word.
    const found = parseEsminiOutput({ stderr: 'Error: something went badly wrong here\n' })
    expect(found[0].message).toBe('Error: something went badly wrong here')
  })

  it('notes a nonzero exit with no recognizable output', () => {
    const found = parseEsminiOutput({ stdout: 'nothing useful', exitCode: 9 })
    expect(found.map(f => f.rule)).toEqual(['esmini.nonzero-exit'])
  })

  it('attributes findings to the tool, never the map', () => {
    // esmini disagreeing with a document is evidence about the pair, so it
    // must not be able to redden a report on its own.
    const found = parseEsminiOutput({ stderr: 'Error: cannot follow geometry\n', exitCode: 1 })
    expect(found.every(f => f.category === 'TOOL_LIMITATION')).toBe(true)

    const report = validateOpenDrive(readFixture('fabriksgatan.xodr'), {
      externalFindings: found,
    })
    expect(report.verdict).toBe('yellow')
    expect(report.counts.MAP_DEFECT).toBe(0)
  })
})

describe('esminiSkipped', () => {
  it('produces a single info finding that keeps a report green', () => {
    const found = esminiSkipped('no binary supplied')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ rule: 'esmini.skipped', severity: 'info', category: 'INFO' })

    const report = validateOpenDrive(readFixture('fabriksgatan.xodr'), { externalFindings: found })
    expect(report.verdict).toBe('green')
  })
})
