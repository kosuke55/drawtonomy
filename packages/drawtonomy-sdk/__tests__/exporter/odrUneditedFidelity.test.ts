// What an unedited round trip guarantees.
//
// The compatibility bar is stated against the INPUT, not against a previous
// release: an unedited export must reproduce at least as many of the source's
// <road> elements byte for byte as it does today. "Byte-identical to the
// previous exporter" cannot be the bar, because a change that carries MORE of
// the input verbatim necessarily differs from the old output while being
// strictly closer to the source.
//
// town04-junction106 is that case. Its input already contains links to
// junction ids it never defines (281 / 252 / 741 / 773). Treating a dangling
// reference as a reason to regenerate rebuilt roads the user never touched:
// 0 of its 16 source roads came back byte for byte and the output grew to 48
// roads. Not treating it as one keeps all 16 and the road count. The output
// bytes differ from the older exporter's, and the direction of the change is
// toward the input — so what is pinned here is how much of the source
// survives, which is the property that actually matters.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { extractOdrDocument } from '../../src/exporter/odrCarryThrough'
import { snapshotFrom } from './helpers/snapshotFrom'

const FIXTURES = join(__dirname, '..', 'fixtures')

/**
 * Minimum number of source <road> elements that must come back byte for byte
 * from an unedited export, and the total the fixture has.
 *
 * These are measured floors, not aspirations: the suite fails if a change
 * carries LESS of the input than it does now. Raising a floor when a change
 * carries more is the intended way to edit this table.
 */
const VERBATIM_FLOOR: Record<string, { verbatim: number; total: number }> = {
  'fabriksgatan.xodr': { verbatim: 16, total: 16 },
  'micro_road_junction.xodr': { verbatim: 8, total: 8 },
  'parking_demo.xodr': { verbatim: 7, total: 7 },
  'signals_two_roads.xodr': { verbatim: 2, total: 2 },
  'soderleden.xodr': { verbatim: 5, total: 5 },
  'two_plus_one.xodr': { verbatim: 1, total: 1 },
  // The dangling-junction fixture: all 16 roads carried, against 0 of 16 for
  // an exporter that dirtied on a reference to an undefined junction.
  'town04-junction106.xodr': { verbatim: 16, total: 16 },
}

describe('unedited round trip carries the input', () => {
  for (const [name, floor] of Object.entries(VERBATIM_FLOOR)) {
    it(`reproduces at least ${floor.verbatim}/${floor.total} source roads of ${name}`, () => {
      const xml = readFileSync(join(FIXTURES, name), 'utf-8')
      const imported = odrToShapes(parseOpenDriveXml(xml))
      const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

      const source = extractOdrDocument(xml)!
      expect(source.roads.length).toBe(floor.total)

      const verbatim = source.roads.filter(r => out.includes(r.text)).length
      expect(verbatim).toBeGreaterThanOrEqual(floor.verbatim)

      // Nothing is invented or lost while doing it.
      expect(extractOdrDocument(out)!.roads.length).toBe(source.roads.length)
    })
  }

  it('is a fixpoint: re-importing an unedited export reproduces it exactly', () => {
    // Whatever the first export decided, doing it again must not drift. This
    // is the property a release can rely on without freezing a byte sequence.
    for (const name of Object.keys(VERBATIM_FLOOR)) {
      const xml = readFileSync(join(FIXTURES, name), 'utf-8')
      const first = exportToOpenDrive(
        snapshotFrom(odrToShapes(parseOpenDriveXml(xml))),
        { sidecar: odrToShapes(parseOpenDriveXml(xml)).sidecar }
      )
      const reimported = odrToShapes(parseOpenDriveXml(first))
      const second = exportToOpenDrive(snapshotFrom(reimported), { sidecar: reimported.sidecar })
      // The header carries an export date, which is the only licensed drift.
      const mask = (s: string): string => s.replace(/date="[^"]*"/g, 'date="X"')
      expect(mask(second)).toBe(mask(first))
    }
  })
})
