// Layer 6: esmini road-manager adapter (`esmini.*`).
//
// esmini's road manager loads an OpenDRIVE file and complains about things a
// static reader cannot easily see — unroutable connections, lanes it refuses
// to link, geometry it cannot follow. Running it is a useful second opinion,
// but it is an external binary, so the split here is deliberate:
//
//   this module   pure: turns captured stdout/stderr text into findings.
//                 No fs, no child_process, so the validator core still runs
//                 in a browser and the parsing is unit-testable without the
//                 binary being installed.
//   scripts/      spawns the process and feeds the output in here.
//
// The findings are attributed TOOL_LIMITATION rather than MAP_DEFECT: esmini
// disagreeing with a document is evidence about the pair, not proof the map is
// at fault, so it never turns a report red on its own.

import type { OdrFinding } from './types.js'

/** Result of an external road-manager run, as captured by the caller. */
export interface EsminiRunOutput {
  /** Combined or separate process output. Both are scanned. */
  stdout?: string
  stderr?: string
  /** Process exit code, when the caller has one. */
  exitCode?: number | null
}

/**
 * Lines worth reporting. esmini prefixes real problems with these markers;
 * everything else it prints is progress chatter.
 */
const INTERESTING = [
  { pattern: /\berror\b/i, rule: 'esmini.error' },
  { pattern: /\bfailed\b/i, rule: 'esmini.error' },
  { pattern: /no connection/i, rule: 'esmini.no-connection' },
  { pattern: /\bwarning\b/i, rule: 'esmini.warning' },
] as const

/** Findings reported when no binary was available. */
export function esminiSkipped(reason: string): OdrFinding[] {
  return [
    {
      severity: 'info',
      category: 'INFO',
      rule: 'esmini.skipped',
      message: `esmini road-manager check skipped: ${reason}`,
    },
  ]
}

/**
 * Turn captured road-manager output into findings.
 *
 * Duplicate lines are collapsed with a count, because esmini repeats the same
 * complaint once per lane and an unfiltered dump buries every other layer's
 * findings under hundreds of identical rows.
 */
export function parseEsminiOutput(output: EsminiRunOutput): OdrFinding[] {
  const text = [output.stdout ?? '', output.stderr ?? ''].join('\n')
  const seen = new Map<
    string,
    { rule: string; severity: 'error' | 'warning'; line: string; count: number }
  >()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue
    const match = INTERESTING.find(entry => entry.pattern.test(line))
    if (!match) continue
    const severity = match.rule === 'esmini.warning' ? 'warning' : 'error'
    const key = `${match.rule}|${line}`
    const existing = seen.get(key)
    if (existing) existing.count += 1
    else seen.set(key, { rule: match.rule, severity, line, count: 1 })
  }

  const findings: OdrFinding[] = []
  for (const entry of seen.values()) {
    const { line } = entry
    findings.push({
      severity: entry.severity,
      // Attribution: esmini's opinion is evidence about the tool/map pair, not
      // a verdict on the map, so it must not redden a report by itself.
      category: 'TOOL_LIMITATION',
      rule: entry.rule,
      message: entry.count > 1 ? `${line} (x${entry.count})` : line,
    })
  }

  if (findings.length === 0) {
    const exit = output.exitCode
    if (exit !== undefined && exit !== null && exit !== 0) {
      findings.push({
        severity: 'warning',
        category: 'TOOL_LIMITATION',
        rule: 'esmini.nonzero-exit',
        message: `esmini exited with code ${exit} but printed nothing recognizable`,
      })
    } else {
      findings.push({
        severity: 'info',
        category: 'INFO',
        rule: 'esmini.clean',
        message: 'esmini road manager loaded the document without complaint',
      })
    }
  }

  return findings
}
