// Strict OpenDRIVE validation from the command line.
//
// Usage:
//   npx tsx scripts/odr-validate.mts <file.xodr> [--json out.json]
//                                    [--esmini <bin>] [--limit N] [--quiet]
//
// Exit codes double as the CI gate:
//   0  green   informational findings only
//   1  yellow  warnings, or constructs drawtonomy cannot represent
//   2  red     the document has a defect
//   3  usage / IO error (distinct from a verdict, so a broken invocation is
//              never mistaken for a clean map)
//
// This is where the Node-only parts live: reading the file and spawning the
// external road manager. src/validator/ itself stays pure so it also runs in
// the browser.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { validateOpenDrive } from '../src/validator/index'
import { parseEsminiOutput, esminiSkipped } from '../src/validator/esminiAdapter'
import type { OdrFinding, OdrValidationReport, OdrVerdict } from '../src/validator/index'

interface CliOptions {
  file: string
  jsonOut: string | null
  esminiBinary: string | null
  limit: number
  quiet: boolean
}

function usage(message?: string): never {
  if (message) console.error(`odr-validate: ${message}`)
  console.error(
    'usage: odr-validate.mts <file.xodr> [--json <out.json>] [--esmini <bin>] [--limit N] [--quiet]'
  )
  process.exit(3)
}

function parseArgs(argv: string[]): CliOptions {
  let file: string | null = null
  let jsonOut: string | null = null
  // The binary may also come from the environment, so a CI job can enable the
  // external check for every invocation without editing each call site.
  let esminiBinary: string | null = process.env.ODR_VALIDATE_ESMINI ?? null
  let limit = 20
  let quiet = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--json':
        jsonOut = argv[++i] ?? usage('--json needs a path')
        break
      case '--esmini':
        esminiBinary = argv[++i] ?? usage('--esmini needs a path')
        break
      case '--limit': {
        const raw = argv[++i] ?? usage('--limit needs a number')
        limit = Number(raw)
        if (!Number.isFinite(limit) || limit < 0) usage(`--limit "${raw}" is not a count`)
        break
      }
      case '--quiet':
        quiet = true
        break
      case '-h':
      case '--help':
        usage()
        break
      default:
        if (arg.startsWith('-')) usage(`unknown option "${arg}"`)
        if (file !== null) usage('more than one input file given')
        file = arg
    }
  }

  if (file === null) usage('no input file given')
  return { file, jsonOut, esminiBinary, limit, quiet }
}

/**
 * Run the external road manager over the file, if a binary was supplied.
 * Never throws: a missing or broken binary downgrades to an info finding
 * rather than failing the validation run.
 */
function runEsmini(binary: string | null, file: string): OdrFinding[] {
  if (!binary) return esminiSkipped('no binary supplied (--esmini or ODR_VALIDATE_ESMINI)')
  if (!existsSync(binary)) return esminiSkipped(`binary not found at ${binary}`)
  try {
    const proc = spawnSync(binary, ['--odr', file, '--headless'], {
      encoding: 'utf8',
      timeout: 60_000,
    })
    if (proc.error) return esminiSkipped(`could not run ${binary}: ${proc.error.message}`)
    return parseEsminiOutput({
      stdout: proc.stdout ?? '',
      stderr: proc.stderr ?? '',
      exitCode: proc.status,
    })
  } catch (err) {
    return esminiSkipped(`could not run ${binary}: ${err instanceof Error ? err.message : err}`)
  }
}

const VERDICT_EXIT: Record<OdrVerdict, number> = { green: 0, yellow: 1, red: 2 }

function formatLocation(finding: OdrFinding): string {
  const loc = finding.location
  if (!loc) return ''
  const parts: string[] = []
  if (loc.roadId !== undefined) parts.push(`road ${loc.roadId}`)
  if (loc.junctionId !== undefined) parts.push(`junction ${loc.junctionId}`)
  if (loc.laneId !== undefined) parts.push(`lane ${loc.laneId}`)
  if (loc.s !== undefined) parts.push(`s=${loc.s.toFixed(2)}`)
  return parts.length > 0 ? `  [${parts.join(', ')}]` : ''
}

/** Human summary: counts per rule first, then the detail rows. */
function printReport(report: OdrValidationReport, file: string, limit: number): void {
  const { counts, verdict, findings } = report

  console.log(`\n${file}`)
  console.log(`  verdict: ${verdict.toUpperCase()}`)
  console.log(
    `  ${counts.error} error / ${counts.warning} warning / ${counts.info} info` +
      `   (${counts.MAP_DEFECT} map defect, ${counts.TOOL_LIMITATION} tool limitation, ${counts.INFO} info)`
  )

  if (findings.length === 0) {
    console.log('  no findings')
    return
  }

  const byRule = new Map<string, { count: number; severity: string; category: string }>()
  for (const f of findings) {
    const entry = byRule.get(f.rule)
    if (entry) entry.count += 1
    else byRule.set(f.rule, { count: 1, severity: f.severity, category: f.category })
  }

  console.log('\n  findings by rule:')
  const sorted = [...byRule.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [rule, entry] of sorted) {
    console.log(
      `    ${String(entry.count).padStart(5)}  ${rule.padEnd(34)} ${entry.severity}/${entry.category}`
    )
  }

  // Detail rows, worst first, so a truncated list still shows what matters.
  const rank = { error: 0, warning: 1, info: 2 } as const
  const detail = [...findings].sort((a, b) => rank[a.severity] - rank[b.severity])
  const shown = limit === 0 ? detail : detail.slice(0, limit)
  if (shown.length > 0) {
    console.log(`\n  detail (${shown.length} of ${findings.length}):`)
    for (const f of shown) {
      console.log(`    ${f.severity.padEnd(7)} ${f.rule}${formatLocation(f)}`)
      console.log(`            ${f.message}`)
    }
    if (shown.length < findings.length) {
      console.log(`\n    ... ${findings.length - shown.length} more (use --limit 0 for all)`)
    }
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))

  let xml: string
  try {
    xml = readFileSync(opts.file, 'utf8')
  } catch (err) {
    console.error(`odr-validate: cannot read ${opts.file}: ${err instanceof Error ? err.message : err}`)
    process.exit(3)
  }

  const externalFindings = runEsmini(opts.esminiBinary, opts.file)
  const report = validateOpenDrive(xml, { externalFindings })

  if (!opts.quiet) printReport(report, opts.file, opts.limit)

  if (opts.jsonOut) {
    try {
      writeFileSync(opts.jsonOut, `${JSON.stringify({ file: opts.file, ...report }, null, 2)}\n`)
      if (!opts.quiet) console.log(`\n  wrote ${opts.jsonOut}`)
    } catch (err) {
      console.error(
        `odr-validate: cannot write ${opts.jsonOut}: ${err instanceof Error ? err.message : err}`
      )
      process.exit(3)
    }
  }

  process.exit(VERDICT_EXIT[report.verdict])
}

main()
