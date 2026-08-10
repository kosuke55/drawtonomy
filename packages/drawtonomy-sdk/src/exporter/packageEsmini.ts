// One-shot helper that builds an esmini-friendly zip from a snapshot:
// `<baseName>.zip` containing `<baseName>/<baseName>.xodr` and
// `<baseName>/<baseName>.xosc`. The xosc <LogicFile> reference uses the same
// baseName so the bundle works without renames.

import type { DrawtonomySnapshot } from '../types.js'
import { exportToOpenDrive } from './opendrive.js'
import { exportToOpenScenario, type TemplateResolver } from './openscenario.js'
import { sanitizeFileBaseName } from './sanitize.js'
import { buildZip } from './zip.js'

export interface EsminiPackageOptions {
  /**
   * Base name (without extension). Sanitized before use; falls back to
   * "drawtonomy" if the input is empty or only invalid characters.
   */
  baseName?: string
  /** Optional template resolver hook for xosc. */
  templateResolver?: TemplateResolver
}

export interface EsminiPackageResult {
  blob: Blob
  /** Sanitized base name actually used for the archive. */
  baseName: string
}

export function buildEsminiZip(
  snapshot: DrawtonomySnapshot,
  options: EsminiPackageOptions = {}
): EsminiPackageResult {
  const sanitized = options.baseName ? sanitizeFileBaseName(options.baseName) : null
  const baseName = sanitized ?? 'drawtonomy'
  const xodrXml = exportToOpenDrive(snapshot)
  const xoscXml = exportToOpenScenario(snapshot, {
    xodrFilename: `${baseName}.xodr`,
    templateResolver: options.templateResolver,
  })
  const blob = buildZip([
    { path: `${baseName}/${baseName}.xodr`, data: xodrXml },
    { path: `${baseName}/${baseName}.xosc`, data: xoscXml },
  ])
  return { blob, baseName }
}
