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
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive, __replanCounters } from '../../src/exporter/opendrive'
import { snapshotFrom } from './helpers/snapshotFrom'
import { chainXodr, reidentifyConnectingBoundaries } from './helpers/junctionChain'

const exportChain = (junctionCount: number): { rounds: number; out: string } => {
  const imported = odrToShapes(parseOpenDriveXml(chainXodr(junctionCount)))
  reidentifyConnectingBoundaries(imported, junctionCount)
  // One real edit, on the first connecting road only. Everything after it is
  // dragged in by the chain, not by the user.
  const firstRec = imported.sidecar.roadRecords!['1000']
  const lane = imported.lanes.find(l => l.id === firstRec.laneShapeIds[0])!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

  __replanCounters.reset()
  const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
  return { rounds: __replanCounters.planRounds, out }
}

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

  it('reaches the same plan the one-junction-per-round loop reached', () => {
    // Converging sooner must not change WHAT is emitted: every junction that
    // cannot keep its table is still rebuilt, and no road is invented or lost.
    const { out } = exportChain(12)
    // head + 12 connecting + tail, plus the connecting roads the rebuilt
    // intersections synthesize.
    expect((out.match(/<road\b/g) ?? []).length).toBe(30)

    // No road is left claiming a junction the document does not define.
    const defined = new Set(
      (out.match(/<junction\b[^>]*?\bid="([^"]*)"/g) ?? []).map(
        t => t.match(/\bid="([^"]*)"/)![1]
      )
    )
    for (const tag of out.match(/<road\b[^>]*>/g) ?? []) {
      const j = tag.match(/\bjunction="([^"]*)"/)?.[1]
      if (j !== undefined && j !== '-1') expect(defined.has(j)).toBe(true)
    }
  })
})
