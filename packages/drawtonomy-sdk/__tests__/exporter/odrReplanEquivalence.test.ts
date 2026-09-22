// The fast fixpoint must be the SAME fixpoint.
//
// Settling the carry plan against the bundles used to cost one re-planning
// round per junction: a rejection dirties its connecting roads, and on a chain
// that breaks the NEXT junction's table, which only came up on the following
// round. The exporter now follows a rejection's consequences inside the round.
//
// That speed-up is only legitimate if the output does not change, and the
// output is easy to get subtly wrong: following consequences early means
// asking about roads whose bundles this round never built, so the emit side
// has to work out for itself how they would regroup and which of the groups
// inherits the road id. Assertions about references resolving, road counts, or
// how many rounds it took all passed while that answer was wrong — and a wrong
// answer drops a junction, and with it the unedited data its roads carry.
//
// So this compares the two implementations directly: the queue (production)
// against the plain loop that hands every consequence back to the caller
// (`__planVariant.followConsequencesInRound = false`), over generated inputs,
// byte for byte.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive, __replanCounters, __planVariant } from '../../src/exporter/opendrive'
import { snapshotFrom } from './helpers/snapshotFrom'
import {
  chainVariantXodr,
  partialLaneLinkChainXodr,
  reidentifyConnectingBoundaries,
  reidentifyBoundariesOf,
  reverseRecordedLaneOrder,
  withSidecarOnlySignal,
  type LaneSides,
} from './helpers/junctionChain'

/** Generated dates differ per run and say nothing about the plan. */
const maskDate = (xml: string): string => xml.replace(/date="[^"]*"/g, 'date="MASKED"')

/** Deterministic PRNG, so a failing case is reproducible from its seed alone. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x100000000
  }
}

interface Case {
  seed: number
  junctionCount: number
  sides: LaneSides[]
  twinAt: number[]
  splitRoads: string[]
  signalRoad: string
  /** Roads whose recorded lane shapes are swapped in the snapshot array. */
  reorderRoads: string[]
}

/**
 * One generated case.
 *
 * (a) which lane sides each junction names, (b) which roads are split, (c)
 * which roads have their lanes reordered in the snapshot, (d) whether a second
 * junction names the other side of the same road. Every one of those four was
 * needed to separate the two implementations at some point.
 */
function makeCase(seed: number): Case {
  const r = rng(seed)
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const junctionCount = 4 + Math.floor(r() * 5)
  const sides: LaneSides[] = []
  for (let k = 0; k < junctionCount; k++) sides.push(pick(['first', 'second', 'both'] as const))
  const twinAt: number[] = []
  for (let k = 0; k < junctionCount; k++) {
    // Only where the main junction names ONE side, so the twin has the other.
    if (sides[k] !== 'both' && r() < 0.3) twinAt.push(k)
  }
  const roadIds = Array.from({ length: junctionCount }, (_, k) => String(1000 + k))
  const splitRoads = roadIds.filter(() => r() < 0.5)
  // Always edit something, or nothing regenerates and the two loops trivially
  // agree on an all-verbatim document.
  if (splitRoads.length === 0) splitRoads.push(roadIds[0])
  const reorderRoads = roadIds.filter(() => r() < 0.4)
  return {
    seed,
    junctionCount,
    sides,
    twinAt,
    splitRoads,
    signalRoad: pick(roadIds),
    reorderRoads,
  }
}

function buildInput(c: Case): ImportedShapes {
  const xml = withSidecarOnlySignal(
    chainVariantXodr({ junctionCount: c.junctionCount, sides: c.sides, twinAt: c.twinAt }),
    c.signalRoad,
    '500'
  )
  const imported = odrToShapes(parseOpenDriveXml(xml))
  reidentifyBoundariesOf(imported, c.splitRoads)
  // One real edit, so at least one road is genuinely dirty.
  const rec = imported.sidecar.roadRecords![c.splitRoads[0]]
  const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])
  if (lane) lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }
  // Snapshot order decides bundle order, which decides which group of a split
  // road is considered first for the road's id. Reversing a road's lanes is
  // the whole difference in the case that separated the two loops.
  for (const rid of c.reorderRoads) {
    const ids = imported.sidecar.roadRecords![rid]?.laneShapeIds ?? []
    if (ids.length < 2) continue
    const a = imported.lanes.findIndex(l => l.id === ids[0])
    const b = imported.lanes.findIndex(l => l.id === ids[1])
    if (a < 0 || b < 0) continue
    ;[imported.lanes[a], imported.lanes[b]] = [imported.lanes[b], imported.lanes[a]]
  }
  return imported
}

function exportWith(c: Case, followConsequencesInRound: boolean): { out: string; rounds: number } {
  const imported = buildInput(c)
  const previous = __planVariant.followConsequencesInRound
  __planVariant.followConsequencesInRound = followConsequencesInRound
  try {
    __replanCounters.reset()
    const out = maskDate(exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar }))
    return { out, rounds: __replanCounters.planRounds }
  } finally {
    __planVariant.followConsequencesInRound = previous
  }
}

/**
 * The review's reproduction, built the same way every time: the partial
 * lane-link chain, the first two connecting roads split, one real edit, and
 * road 1001's two lanes swapped in the snapshot.
 */
function orderReversedPartialLaneLink(): ImportedShapes {
  const imported = odrToShapes(parseOpenDriveXml(partialLaneLinkChainXodr()))
  // Roads 1000 / 1001 re-bundle into one group per lane; junction 2002 needs
  // road 1001 to come back under its own id for lane -1.
  reidentifyConnectingBoundaries(imported, 2)
  const rec = imported.sidecar.roadRecords!['1000']
  const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }
  reverseRecordedLaneOrder(imported, '1001')
  return imported
}

const describeCase = (c: Case): string =>
  `seed ${c.seed}: J=${c.junctionCount} sides=${c.sides.join(',')} ` +
  `twins=[${c.twinAt.join(',')}] split=[${c.splitRoads.join(',')}] ` +
  `reorder=[${c.reorderRoads.join(',')}] signal on ${c.signalRoad}`

describe('the fast fixpoint equals the plain one', () => {
  // 240 generated cases. Each is a whole import + two exports, so this is the
  // suite's slowest test by design: the equivalence is the thing being pinned
  // and a handful of hand-picked shapes did not catch the last difference.
  it('over 240 generated chains', () => {
    const mismatches: string[] = []
    for (let seed = 1; seed <= 240; seed++) {
      const c = makeCase(seed)
      const fast = exportWith(c, true)
      const plain = exportWith(c, false)
      if (fast.out !== plain.out) mismatches.push(describeCase(c))
    }
    expect(mismatches).toEqual([])
  })

  // Not vacuous: the generator has to actually produce documents where the two
  // loops could disagree — junctions get rejected, roads go dirty as a
  // consequence, and the fast loop really does converge sooner.
  it('generates inputs that exercise the difference', () => {
    let sawRejection = 0
    let sawFewerRounds = 0
    for (let seed = 1; seed <= 40; seed++) {
      const c = makeCase(seed)
      const fast = exportWith(c, true)
      const plain = exportWith(c, false)
      if (plain.rounds > 1) sawRejection++
      if (fast.rounds < plain.rounds) sawFewerRounds++
    }
    expect(sawRejection).toBeGreaterThan(10)
    expect(sawFewerRounds).toBeGreaterThan(0)
  })

  // The case this was built around, kept by name and by what it protects.
  //
  // Junction 2002 names only lane -1 of roads 1001 / 1002, and road 1001's two
  // lanes are reversed in the snapshot so the -2 side comes first in bundle
  // order. Junctions 2000 and 2001 are rejected on the way; their demand for
  // road 1001's -2 side has to stop counting the moment they go, or 1001's id
  // lands on the -2 group, junction 2002 is dropped as unresolvable, and the
  // <signal> on the unedited road 1002 goes with it. Nothing about the input
  // is unusual: the same document with the two lanes the other way round was
  // already correct.
  it('stops a rejected junction demanding a side', () => {
    const imported = orderReversedPartialLaneLink()
    const out = maskDate(exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar }))
    const reference = (() => {
      const again = orderReversedPartialLaneLink()
      const previous = __planVariant.followConsequencesInRound
      __planVariant.followConsequencesInRound = false
      try {
        return maskDate(exportToOpenDrive(snapshotFrom(again), { sidecar: again.sidecar }))
      } finally {
        __planVariant.followConsequencesInRound = previous
      }
    })()

    expect(out).toBe(reference)
    // Which is to say: the junction, the road's membership in it, and the
    // unedited signal on that road are all still there.
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out.match(/<road\b[^>]*\bid="1002"[^>]*>/)![0]).toMatch(/\bjunction="2002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
  })

  // And byte for byte against the pre-change build, so this is pinned to what
  // the exporter emitted before any of this machinery existed, not just to
  // itself. Same masking and same rule as the other preR4Chain goldens.
  it('matches the pre-change build on the order-reversed chain', () => {
    const imported = orderReversedPartialLaneLink()
    __replanCounters.reset()
    const out = maskDate(exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar }))
    expect(out).toBe(
      readFileSync(
        join(__dirname, '..', 'fixtures', 'preR4Chain', 'chain8-partial-lanelink-reversed.xodr'),
        'utf-8'
      )
    )
    expect(__replanCounters.planRounds).toBeLessThanOrEqual(3)
  })
})

// Not covered on purpose: a road whose RECORDED lane set is exactly some other
// road's. The emit side gives up on such a road (it cannot tell which of them
// claims the id first), where a full re-plan can hand each its own — a real
// difference, but the importer issues one fresh id per lane and records only
// the lanes of the road that produced them, so no imported document can
// contain it. Reaching it needs a sidecar edited by hand after import.
