// Cost of settling the carry plan against the bundles.
//
// Whether a junction can keep its <connection> table depends on where the
// bundles put each lane, and the bundles depend on what the plan decided to
// regenerate. The two are settled by re-planning until nothing new is
// rejected. Each round moves at least one junction from carried to
// rebuildable and never back, so the loop terminates — but rejecting a
// junction dirties its connecting roads, and on a chain where each connecting
// road is the next junction's incoming road, the next rejection only became
// visible on the FOLLOWING round. That cost one full re-plan (whole carry
// derivation, every dirty bundle re-fitted) per junction: measured at 3/8/20/
// 50/100 junctions it was exactly 3/8/20/50/100 rounds, 100 taking ~5 s.
//
// The consequences of a rejection are now followed to a fixpoint within the
// round, so the caller re-plans a constant number of times. This pins the
// shape of the growth, not a wall-clock time.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive, __replanCounters } from '../../src/exporter/opendrive'
import { snapshotFrom } from './helpers/snapshotFrom'
import { chainXodr, reidentifyConnectingBoundaries } from './helpers/junctionChain'

/**
 * Export the chain with the first `splitCount` connecting roads' boundaries
 * re-identified. `splitCount` defaults to the whole chain; a SMALLER one is
 * the interesting case, because then the roads the cascade drags in are ones
 * this round built no bundle for.
 */
const exportChain = (
  junctionCount: number,
  splitCount: number = junctionCount
): { rounds: number; out: string } => {
  const imported = odrToShapes(parseOpenDriveXml(chainXodr(junctionCount)))
  reidentifyConnectingBoundaries(imported, splitCount)
  // One real edit, on the first connecting road only. Everything after it is
  // dragged in by the chain, not by the user.
  const firstRec = imported.sidecar.roadRecords!['1000']
  const lane = imported.lanes.find(l => l.id === firstRec.laneShapeIds[0])!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

  __replanCounters.reset()
  const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
  return { rounds: __replanCounters.planRounds, out }
}

/** Generated dates differ per run and say nothing about the plan. */
const maskDate = (xml: string): string => xml.replace(/date="[^"]*"/g, 'date="MASKED"')

/** What the one-junction-per-round loop emitted; see fixtures/README.md. */
const preR4Golden = (splitCount: number): string =>
  readFileSync(
    join(__dirname, '..', 'fixtures', 'preR4Chain', `chain8-split${splitCount}.xodr`),
    'utf-8'
  )

describe('re-planning cost on a chain of junctions', () => {
  it('does not spend a planning round per junction', () => {
    const small = exportChain(5)
    const large = exportChain(50)

    // The point: rounds must not track the chain length. A ten-fold longer
    // chain costs no more rounds than the short one.
    expect(large.rounds).toBeLessThanOrEqual(small.rounds)
    // And far below the J+1 worst case the loop structurally allows.
    expect(large.rounds).toBeLessThan(10)

    // The whole chain really was rejected — otherwise the round count is low
    // only because the cascade never happened and the test proves nothing.
    expect(__replanCounters.rejectedPerRound[0]).toBeGreaterThanOrEqual(50)
  })

  // The same fixpoint, not merely a plausible one. Comparing road counts and
  // "every junction named is defined" passes for many DIFFERENT plans, and it
  // did: converging early made the queue ask about roads it had just dirtied,
  // whose bundles this round had not built, and reading that silence as "the
  // id could not be kept" rejected the whole chain downstream of the first
  // rejection — a different plan, carrying different data, that those checks
  // could not see. These compare the bytes.
  //
  // Three extents, because the failure only appeared when the edit stopped
  // short of the whole chain: with everything already dirty there are no
  // unbuilt roads left to misjudge.
  for (const splitCount of [1, 4, 8]) {
    it(`reaches the same plan the one-junction-per-round loop reached (split ${splitCount})`, () => {
      const { out, rounds } = exportChain(8, splitCount)
      expect(maskDate(out)).toBe(preR4Golden(splitCount))
      // And still without a round per junction.
      expect(rounds).toBeLessThanOrEqual(3)
    })
  }

  // The splits above have every <connection> name BOTH lanes, so the road a
  // rejection dirties either keeps its id whole or is a loss either way. When
  // the table names only one side, the plan hands the road's id to the side it
  // names — and calling that "the id could not be kept" rejects the junction,
  // and with it the unedited road it stamps.
  it('keeps an id the plan hands to the side a junction names', () => {
    // Junction 2002 names lane -1 of roads 1001 / 1002 only.
    let xml = chainXodr(8).replace(
      `    <connection id="0" incomingRoad="1001" connectingRoad="1002" contactPoint="start">
      <laneLink from="-1" to="-1"/>
      <laneLink from="-2" to="-2"/>
    </connection>`,
      `    <connection id="0" incomingRoad="1001" connectingRoad="1002" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>`
    )
    // ... so road 1002's lane -2 must not claim a predecessor the table no
    // longer links, or the input itself carries a dangling lane reference.
    const road1002 = xml.match(/ {2}<road name="conn2"[\s\S]*?<\/road>/)![0]
    xml = xml.replace(
      road1002,
      road1002.replace('<link><predecessor id="-2"/><successor id="-2"/></link>', '<link><successor id="-2"/></link>')
    )
    // A <signal> the importer never shapes, on a road nobody edited. It
    // survives only while road 1002's junction is still carried.
    xml = xml.replace(
      '<road name="conn2" length="40" id="1002" junction="2002">',
      '<road name="conn2" length="40" id="1002" junction="2002">\n' +
        '    <signals><signal s="10" t="-1" id="500" type="999999" dynamic="yes" orientation="+"/></signals>'
    )

    const imported = odrToShapes(parseOpenDriveXml(xml))
    // Roads 1000 / 1001 re-bundle into one group per lane; junction 2002 needs
    // road 1001 to come back under its own id for lane -1.
    reidentifyConnectingBoundaries(imported, 2)
    const rec = imported.sidecar.roadRecords!['1000']
    const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
    lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

    __replanCounters.reset()
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

    // The bytes, against what the one-junction-per-round loop emitted.
    expect(maskDate(out)).toBe(
      readFileSync(join(__dirname, '..', 'fixtures', 'preR4Chain', 'chain8-partial-lanelink.xodr'), 'utf-8')
    )
    // Which is to say: the junction, the road's membership in it, and the
    // signal on that road are all still there.
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out.match(/<road\b[^>]*\bid="1002"[^>]*>/)![0]).toMatch(/\bjunction="2002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
    // And still without a round per junction.
    expect(__replanCounters.planRounds).toBeLessThanOrEqual(3)
  })

  it('keeps the unedited data the old loop kept', () => {
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
