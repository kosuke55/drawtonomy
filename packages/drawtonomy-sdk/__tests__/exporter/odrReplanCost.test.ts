// Settling the carry plan against the bundles: what it must produce, and what
// it costs.
//
// Whether a junction can keep its <connection> table depends on where the
// bundles put each lane, and the bundles depend on what the plan decided to
// regenerate. The two are settled by re-planning the WHOLE document until a
// round rejects nothing new. Each round moves at least one junction from
// carried to rebuildable and never back, so the loop terminates, and the bound
// is the one that structure gives: (junctions rejected) + 1 rounds.
//
// That bound is not tight. Rejecting a junction dirties its connecting roads,
// and a road that goes dirty can break the NEXT junction's table — which only
// becomes visible on the following round. On a chain where each connecting
// road is the next junction's incoming road, the fixpoint therefore advances
// one junction per round.
//
// Predicting a rejection's consequences inside the round was tried and
// withdrawn; see `fixtures/README.md`. The expectations pinned here are the
// ones that survive: the output, and the structural bound. Wall-clock numbers
// are recorded in the README as a known limit, not asserted.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive, __replanCounters } from '../../src/exporter/opendrive'
import { snapshotFrom } from './helpers/snapshotFrom'
import {
  chainXodr,
  partialLaneLinkChainXodr,
  reidentifyConnectingBoundaries,
} from './helpers/junctionChain'

/**
 * Export the chain with the first `splitCount` connecting roads' boundaries
 * re-identified. `splitCount` defaults to the whole chain; a SMALLER one is
 * the interesting case, because then the roads the cascade drags in are ones
 * the rejecting round built no bundle for.
 */
const exportChain = (
  junctionCount: number,
  splitCount: number = junctionCount
): { rounds: number; rejected: number[]; out: string } => {
  const imported = odrToShapes(parseOpenDriveXml(chainXodr(junctionCount)))
  reidentifyConnectingBoundaries(imported, splitCount)
  // One real edit, on the first connecting road only. Everything after it is
  // dragged in by the chain, not by the user.
  const firstRec = imported.sidecar.roadRecords!['1000']
  const lane = imported.lanes.find(l => l.id === firstRec.laneShapeIds[0])!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

  __replanCounters.reset()
  const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
  return {
    rounds: __replanCounters.planRounds,
    rejected: [...__replanCounters.rejectedPerRound],
    out,
  }
}

/** Generated dates differ per run and say nothing about the plan. */
const maskDate = (xml: string): string => xml.replace(/date="[^"]*"/g, 'date="MASKED"')

/** What the whole-plan loop emits; see fixtures/README.md. */
const golden = (name: string): string =>
  readFileSync(join(__dirname, '..', 'fixtures', 'preR4Chain', name), 'utf-8')

describe('settling the carry plan against the bundles', () => {
  // The bound the loop's structure gives, and the only one it gives. A round
  // that rejects nothing is the last, so the rounds are the rejecting ones
  // plus the settled one — and no junction is ever reconsidered, so they
  // cannot exceed the junctions that were rejected at all.
  for (const [junctionCount, splitCount] of [
    [8, 1],
    [8, 4],
    [8, 8],
    [50, 1],
    [50, 50],
  ] as const) {
    it(`stops within (rejections + 1) rounds at J=${junctionCount}, split ${splitCount}`, () => {
      const { rounds, rejected } = exportChain(junctionCount, splitCount)
      const totalRejected = rejected.reduce((n, k) => n + k, 0)
      expect(rounds).toBe(rejected.length + 1)
      expect(rounds).toBeLessThanOrEqual(totalRejected + 1)
      expect(rounds).toBeLessThanOrEqual(junctionCount + 1)
      // Not vacuous: the chain really was rejected, so the loop really did
      // have to iterate.
      expect(totalRejected).toBeGreaterThan(0)
    }, 120_000)
  }

  // The same fixpoint, byte for byte. Comparing road counts and "every
  // junction named is defined" passes for many DIFFERENT plans, and it did:
  // a plan that over-rejected the chain carried different data and those
  // checks could not see it. These compare the bytes.
  //
  // Three extents, because the failure only appeared when the edit stopped
  // short of the whole chain: with everything already dirty there are no
  // unbuilt roads left to misjudge.
  for (const splitCount of [1, 4, 8]) {
    it(`emits the settled plan's bytes (split ${splitCount})`, () => {
      const { out } = exportChain(8, splitCount)
      expect(maskDate(out)).toBe(golden(`chain8-split${splitCount}.xodr`))
    })
  }

  // The splits above have every <connection> name BOTH lanes, so the road a
  // rejection dirties either keeps its id whole or is a loss either way. When
  // the table names only one side, the plan hands the road's id to the side it
  // names — and calling that "the id could not be kept" rejects the junction,
  // and with it the unedited road it stamps.
  it('keeps an id the plan hands to the side a junction names', () => {
    // Junction 2002 names lane -1 of roads 1001 / 1002 only, and a <signal>
    // the importer never shapes sits on the unedited road 1002: it survives
    // only while that road's junction is still carried.
    const imported = odrToShapes(parseOpenDriveXml(partialLaneLinkChainXodr()))
    // Roads 1000 / 1001 re-bundle into one group per lane; junction 2002 needs
    // road 1001 to come back under its own id for lane -1.
    reidentifyConnectingBoundaries(imported, 2)
    const rec = imported.sidecar.roadRecords!['1000']
    const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
    lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

    expect(maskDate(out)).toBe(golden('chain8-partial-lanelink.xodr'))
    // Which is to say: the junction, the road's membership in it, and the
    // signal on that road are all still there.
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out.match(/<road\b[^>]*\bid="1002"[^>]*>/)![0]).toMatch(/\bjunction="2002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
  })

  it('keeps the unedited data a whole re-plan keeps', () => {
    // A <signal> the importer never shapes (unknown type) on a connecting road
    // the user did not touch. It survives only if that road's junction is
    // still carried, so it fails loudly when the chain is over-rejected.
    const xml = chainXodr(8).replace(
      '<road name="conn4" length="40" id="1004" junction="2004">',
      '<road name="conn4" length="40" id="1004" junction="2004">\n' +
        '    <signals><signal s="10" t="-1" id="500" type="999999" dynamic="yes" orientation="+"/></signals>'
    )
    const imported = odrToShapes(parseOpenDriveXml(xml))
    reidentifyConnectingBoundaries(imported, 1)
    const rec = imported.sidecar.roadRecords!['1000']
    const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
    lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
    // And road 1004 still says which junction it belongs to.
    const road = out.match(/<road\b[^>]*\bid="1004"[^>]*>/)![0]
    expect(road).not.toMatch(/\bjunction="-1"/)
  })
})
