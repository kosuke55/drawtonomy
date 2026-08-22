// CLI tests: scripts/odr-validate.mts.
//
// The exit code is the contract a CI job depends on, so it is asserted for
// every verdict as well as for a broken invocation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXTURE_DIR, readFixture } from './corpus'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(PKG_ROOT, 'scripts', 'odr-validate.mts')

let workDir: string

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'odr-validate-'))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    cwd: PKG_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, ODR_VALIDATE_ESMINI: '' },
  })
  return { status: proc.status ?? -1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' }
}

describe('odr-validate CLI', () => {
  it('exits 0 and reports green on a clean map', () => {
    const result = runCli([join(FIXTURE_DIR, 'fabriksgatan.xodr')])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('verdict: GREEN')
  }, 120_000)

  it('exits 1 and reports yellow on an excerpted map', () => {
    const result = runCli([join(FIXTURE_DIR, 'town04-junction106.xodr')])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('verdict: YELLOW')
    expect(result.stdout).toContain('ref.unresolved-junction-link')
  }, 120_000)

  it('exits 2 and reports red on a defective map', () => {
    const truncated = join(workDir, 'truncated.xodr')
    const xml = readFixture('fabriksgatan.xodr')
    writeFileSync(truncated, xml.slice(0, Math.floor(xml.length * 0.6)))
    const result = runCli([truncated])
    expect(result.status).toBe(2)
    expect(result.stdout).toContain('verdict: RED')
    expect(result.stdout).toContain('xml.truncated')
  }, 120_000)

  it('exits 3 on a usage error, distinctly from any verdict', () => {
    // A broken invocation must never be mistaken for a clean map.
    expect(runCli([]).status).toBe(3)
    expect(runCli([join(workDir, 'does-not-exist.xodr')]).status).toBe(3)
    expect(runCli(['--nonsense', join(FIXTURE_DIR, 'fabriksgatan.xodr')]).status).toBe(3)
  }, 120_000)

  it('writes a machine-readable report with --json', () => {
    const out = join(workDir, 'report.json')
    const result = runCli([join(FIXTURE_DIR, 'town04-junction106.xodr'), '--json', out, '--quiet'])
    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')

    const parsed = JSON.parse(readFileSync(out, 'utf8'))
    expect(parsed.verdict).toBe('yellow')
    expect(parsed.counts.warning).toBe(4)
    expect(Array.isArray(parsed.findings)).toBe(true)
    expect(parsed.findings[0]).toHaveProperty('rule')
  }, 120_000)

  it('groups findings by rule and truncates the detail list', () => {
    const result = runCli([join(FIXTURE_DIR, 'town04-junction106.xodr'), '--limit', '2'])
    expect(result.stdout).toContain('findings by rule:')
    expect(result.stdout).toContain('detail (2 of')
    expect(result.stdout).toContain('more (use --limit 0 for all)')
  }, 120_000)

  it('reports the external check as skipped when no binary is given', () => {
    const result = runCli([join(FIXTURE_DIR, 'fabriksgatan.xodr')])
    expect(result.stdout).toContain('esmini.skipped')
  }, 120_000)

  it('does not fail the run when the esmini binary is missing', () => {
    const result = runCli([
      join(FIXTURE_DIR, 'fabriksgatan.xodr'),
      '--esmini',
      join(workDir, 'no-such-binary'),
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('binary not found')
  }, 120_000)
})
