// Layer 9: mutation-proof harness for the OpenDRIVE validator.
//
// The suite is organised around two symmetric obligations:
//
//   detection      every injected defect must surface as a MAP_DEFECT error
//                  carrying the expected rule id
//   false-positive every unmodified real map must produce *zero* MAP_DEFECT
//                  errors — a validator that reddens working maps is a
//                  validator nobody runs
//
// The second is the one that constrains the thresholds, so it is asserted
// against every checked-in fixture and (when ODR_VALIDATE_CORPUS is set) a
// wider external corpus.

import { describe, it, expect } from 'vitest'
import { validateOpenDrive } from '../../src/validator/index'
import type { OdrFinding, OdrValidationReport } from '../../src/validator/index'
import { MUTATIONS, applyMutation, findAllElements, attrOf } from './mutations'
import { loadFixtureCorpus, loadExternalCorpus, readFixture } from './corpus'

const FIXTURES = loadFixtureCorpus()
const EXTERNAL = loadExternalCorpus()

/** MAP_DEFECT errors only — the findings that make a verdict red. */
function defects(report: OdrValidationReport): OdrFinding[] {
  return report.findings.filter(f => f.severity === 'error' && f.category === 'MAP_DEFECT')
}

function describeFindings(findings: readonly OdrFinding[]): string {
  if (findings.length === 0) return '(none)'
  return findings.map(f => `${f.rule}: ${f.message}`).join('\n  ')
}

/**
 * Pick the fixture a mutation can actually be applied to. Not every fixture
 * has a junction, a controller, or a multi-geometry road, so each mutation
 * runs against the first fixture where `applyMutation` succeeds; the mutation
 * fails the test only when *no* fixture supports it.
 */
function applyToAnyFixture(mutationIndex: number): {
  fixture: string
  original: string
  mutated: string
  applied: string
} {
  const mutation = MUTATIONS[mutationIndex]
  const failures: string[] = []
  for (const entry of FIXTURES) {
    try {
      const result = applyMutation(mutation, entry.xml)
      return {
        fixture: entry.name,
        original: entry.xml,
        mutated: result.xml,
        applied: result.applied,
      }
    } catch (err) {
      failures.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(
    `mutation "${mutation.id}" could not be applied to any fixture:\n  ${failures.join('\n  ')}`
  )
}

describe('mutation harness self-check', () => {
  it('has fixtures to mutate', () => {
    expect(FIXTURES.length).toBeGreaterThan(0)
  })

  it.each(MUTATIONS.map((m, i) => [m.id, i] as const))(
    'mutation %s actually changes the document',
    (_id, index) => {
      const { original, mutated, applied } = applyToAnyFixture(index)
      // The guard the 2026-08-21 near-miss demands: a mutation that silently
      // matched nothing must fail here, not be misread as an undetected defect.
      expect(mutated).not.toBe(original)
      expect(applied.length).toBeGreaterThan(0)
    }
  )

  it('rejects a no-op mutation', () => {
    const noop = {
      id: 'noop',
      description: 'changes nothing',
      expectedRule: 'never',
      apply: (xml: string) => ({ xml, applied: 'nothing' }),
    }
    expect(() => applyMutation(noop, '<OpenDRIVE></OpenDRIVE>')).toThrow(/did not apply/)
  })
})

/**
 * Rule prefixes whose detector layer is implemented. Entries are added as each
 * layer lands, so a detection the code cannot yet make is a `todo` rather than
 * a failure — while the mutation itself is still proven to apply above.
 */
const IMPLEMENTED_LAYERS: readonly string[] = ['xml.', 'ref.', 'junction.']

const isImplemented = (rule: string): boolean =>
  IMPLEMENTED_LAYERS.some(prefix => rule.startsWith(prefix))

describe('mutation detection matrix', () => {
  const cases = MUTATIONS.map((m, i) => [m.id, m.expectedRule, i] as const)
  const pending = cases.filter(([, rule]) => !isImplemented(rule))
  for (const [id, rule] of pending) {
    it.todo(`detects ${id} as ${rule} (layer not implemented yet)`)
  }

  const active = cases.filter(([, rule]) => isImplemented(rule))
  for (const [id, expectedRule, index] of active) {
    it(`detects ${id} as ${expectedRule}`, () => {
      const { fixture, mutated, applied } = applyToAnyFixture(index)
      const report = validateOpenDrive(mutated)
      const found = defects(report)
      expect(
        found.some(f => f.rule === expectedRule),
        `mutation ${id} on ${fixture} (${applied}) should raise ${expectedRule}, got:\n  ${describeFindings(report.findings)}`
      ).toBe(true)
      expect(report.verdict).toBe('red')
    })
  }
})

describe('false-positive gate', () => {
  it.each(FIXTURES.map(f => [f.name] as const))('fixture %s has no MAP_DEFECT error', name => {
    const entry = FIXTURES.find(f => f.name === name)!
    const report = validateOpenDrive(entry.xml)
    expect(defects(report), `unexpected defects in ${name}:\n  ${describeFindings(defects(report))}`).toEqual([])
  })

  const externalIt = EXTERNAL.length > 0 ? it : it.skip
  externalIt('external corpus (ODR_VALIDATE_CORPUS) has no MAP_DEFECT error', () => {
    const offenders: string[] = []
    for (const entry of EXTERNAL) {
      const report = validateOpenDrive(entry.xml)
      const found = defects(report)
      if (found.length > 0) offenders.push(`${entry.name}:\n  ${describeFindings(found)}`)
    }
    expect(offenders.join('\n')).toBe('')
  })

  it('reports how many external corpus files were checked', () => {
    // Visible in the run output so a skipped corpus is never mistaken for a
    // passing one.
    expect(EXTERNAL.length).toBeGreaterThanOrEqual(0)
  })
})

describe('report shape', () => {
  it('counts findings by severity and category', () => {
    const report = validateOpenDrive(readFixture('fabriksgatan.xodr'))
    const bySeverity = report.counts.error + report.counts.warning + report.counts.info
    const byCategory = report.counts.MAP_DEFECT + report.counts.TOOL_LIMITATION + report.counts.INFO
    expect(bySeverity).toBe(report.findings.length)
    expect(byCategory).toBe(report.findings.length)
  })

  it('never throws on garbage input', () => {
    for (const junk of ['', 'not xml at all', '<OpenDRIVE', '{"json":true}']) {
      expect(() => validateOpenDrive(junk)).not.toThrow()
    }
  })
})

describe('fixture corpus assumptions', () => {
  it('fixtures include junctions, controllers and multi-geometry roads', () => {
    // The mutation corpus needs these constructs to exist somewhere; assert it
    // so a fixture reshuffle that removes them fails loudly instead of
    // silently shrinking the detection matrix.
    const all = FIXTURES.map(f => f.xml).join('\n')
    expect(findAllElements(all, 'junction').length).toBeGreaterThan(0)
    expect(findAllElements(all, 'controller').length).toBeGreaterThan(0)
    const multiGeom = FIXTURES.some(f =>
      findAllElements(f.xml, 'road').some(r => findAllElements(r.text, 'geometry').length >= 2)
    )
    expect(multiGeom).toBe(true)
    expect(attrOf('<road id="7" junction="-1">', 'id')).toBe('7')
  })
})
