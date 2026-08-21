// Layer 1: document integrity (`xml.*`).
//
// Filled in by the next commit.

import type { OdrFinding } from '../types.js'

export interface XmlIntegrityResult {
  findings: OdrFinding[]
  /** True when the damage makes parsing pointless (short-circuits later layers). */
  fatal: boolean
}

export function checkXmlIntegrity(_xml: string): XmlIntegrityResult {
  return { findings: [], fatal: false }
}
