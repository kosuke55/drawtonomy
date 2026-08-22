// Strict OpenDRIVE validation entry point.
//
// Layers, run in order (an earlier layer's fatal finding short-circuits the
// later ones, because a truncated document cannot be meaningfully parsed):
//
//   1  xml.*       document integrity  (checkXmlIntegrity)
//   2  ref.*       reference integrity (checkReferences)
//   3  junction.*  junction consistency (checkJunctions)
//   4  geom.*      geometric continuity (checkGeometry)
//   6  esmini.*    external road-manager adapter — supplied by the caller via
//                  `opts.externalFindings`, so this module stays pure (no
//                  child_process, no fs).
//   8  report assembly (counts + verdict)

import { parseOpenDriveXml, type OdrMap } from '../exporter/opendriveParser.js'
import { checkXmlIntegrity } from './layers/xmlIntegrity.js'
import { checkReferences } from './layers/references.js'
import { checkJunctions } from './layers/junctions.js'
import { checkGeometry } from './layers/geometry.js'
import {
  countFindings,
  deriveVerdict,
  resolveGeometryThresholds,
  type OdrFinding,
  type OdrValidationOptions,
  type OdrValidationReport,
} from './types.js'

/** Assemble a report from a finding list (layer 8). */
export function buildReport(findings: readonly OdrFinding[]): OdrValidationReport {
  const list = [...findings]
  return {
    findings: list,
    counts: countFindings(list),
    verdict: deriveVerdict(list),
  }
}

/**
 * Validate an OpenDRIVE document.
 *
 * Unlike the importer this never repairs and never throws on malformed input:
 * a document so broken that it cannot be parsed comes back as a red report
 * rather than an exception, so a batch run over a corpus cannot be derailed by
 * one bad file.
 */
export function validateOpenDrive(
  xml: string,
  opts: OdrValidationOptions = {}
): OdrValidationReport {
  const findings: OdrFinding[] = []

  // Layer 1: document integrity. A document that fails here is not worth
  // parsing — every downstream finding would be an artefact of the damage.
  const integrity = checkXmlIntegrity(xml)
  findings.push(...integrity.findings)
  if (integrity.fatal) return buildReport(findings)

  let map: OdrMap
  try {
    map = parseOpenDriveXml(xml)
  } catch (err) {
    findings.push({
      severity: 'error',
      category: 'MAP_DEFECT',
      rule: 'xml.parse-failed',
      message: `OpenDRIVE parse failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    return buildReport(findings)
  }

  findings.push(...checkReferences(map))
  findings.push(...checkJunctions(map))
  findings.push(...checkGeometry(map, resolveGeometryThresholds(opts.geometry)))

  // Layer 6 results are computed outside (the CLI runs the binary).
  if (opts.externalFindings) findings.push(...opts.externalFindings)

  return buildReport(findings)
}
