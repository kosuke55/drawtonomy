// Corpus loading for the validator tests.
//
// Two sources:
//   - the checked-in fixtures under __tests__/fixtures (always available)
//   - an optional external corpus pointed at by ODR_VALIDATE_CORPUS, used for
//     the false-positive gate against a wider set of real maps. The path is
//     never hard-coded and nothing from it is copied into the repository.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const FIXTURE_DIR = join(HERE, '..', 'fixtures')

export interface CorpusEntry {
  name: string
  xml: string
}

function loadDir(dir: string): CorpusEntry[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.xodr'))
    .sort()
    .map(f => ({ name: f, xml: readFileSync(join(dir, f), 'utf8') }))
}

/** The checked-in .xodr fixtures. */
export function loadFixtureCorpus(): CorpusEntry[] {
  return loadDir(FIXTURE_DIR)
}

/** Read one fixture by file name. */
export function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
}

/**
 * The optional external corpus (ODR_VALIDATE_CORPUS = a directory of .xodr
 * files). Returns an empty list when the variable is unset, so the suite is
 * green on a machine that does not have it.
 */
export function loadExternalCorpus(): CorpusEntry[] {
  const dir = process.env.ODR_VALIDATE_CORPUS
  if (!dir) return []
  return loadDir(dir)
}
