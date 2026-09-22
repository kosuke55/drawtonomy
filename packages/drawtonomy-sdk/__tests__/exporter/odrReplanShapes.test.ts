// The shapes that broke every attempt to predict a rejection's consequences.
//
// Settling the carry plan against the bundles re-plans the whole document
// after each rejection, which costs one round per junction on a chain. Four
// attempts were made to answer the same question locally instead — "if this
// junction goes, does the next one still resolve?" — and each one was
// separated from the whole re-plan by a document of a different shape.
//
// The attempts are gone (see `fixtures/README.md`), but the documents are the
// permanent record of what the shortcut has to reproduce, so they are pinned
// against the whole re-plan's own output here. They are not exotic: every one
// of them is an ordinary import with an ordinary edit, and every one of them
// costs unedited data when it comes out wrong.
//
// What each shape isolates:
//
//   order-reversed      which of a split road's two groups is considered first
//                       for the road's id. A rejected junction's demand for
//                       the other side must stop counting the moment it goes.
//   two junctions       two live junctions naming opposite sides of one road,
//                       so the demands cannot be merged into one set per road.
//   cross-road bundle   a lane that regroups with a lane of a DIFFERENT road.
//                       A road cannot be judged by its own lanes alone.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive, __replanCounters } from '../../src/exporter/opendrive'
import { checkReferences } from '../../src/validator/layers/references'
import { snapshotFrom } from './helpers/snapshotFrom'
import {
  chainVariantXodr,
  crossRoadBundleChainXodr,
  partialLaneLinkChainXodr,
  reidentifyConnectingBoundaries,
  reidentifyBoundariesOf,
  reverseRecordedLaneOrder,
  withSidecarOnlySignal,
  type LaneSides,
} from './helpers/junctionChain'

/** Generated dates differ per run and say nothing about the plan. */
const maskDate = (xml: string): string => xml.replace(/date="[^"]*"/g, 'date="MASKED"')

const golden = (name: string): string =>
  readFileSync(join(__dirname, '..', 'fixtures', 'preR4Chain', name), 'utf-8')

const exportOf = (imported: ImportedShapes): { out: string; rounds: number } => {
  __replanCounters.reset()
  const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
  return { out, rounds: __replanCounters.planRounds }
}

/** Reference findings — a plan that loses track of a road leaves these. */
const brokenRefs = (xml: string): string[] =>
  checkReferences(parseOpenDriveXml(xml))
    .filter(f => f.rule.startsWith('ref.') && f.rule !== 'ref.unresolved-junction-link')
    .map(f => `${f.rule}: ${f.message}`)

/**
 * The partial lane-link chain with road 1001's two lanes the other way round
 * in the snapshot, which is the only difference from the plain case.
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

/** Junction 2002 names lane -1 of road 1001; its twin 2102 names lane -2. */
function twoJunctionChain(): ImportedShapes {
  const sides: LaneSides[] = ['both', 'both', 'first', 'both', 'both', 'both', 'both', 'both']
  const xml = withSidecarOnlySignal(
    chainVariantXodr({ junctionCount: 8, sides, twinAt: [2] }),
    '1002',
    '500'
  )
  const imported = odrToShapes(parseOpenDriveXml(xml))
  reidentifyBoundariesOf(imported, ['1000', '1001'])
  const rec = imported.sidecar.roadRecords!['1000']
  const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }
  return imported
}

/** Both chains edited at their head, so both cascades run. */
function crossRoadBundleChain(): ImportedShapes {
  const imported = odrToShapes(parseOpenDriveXml(crossRoadBundleChainXodr()))
  reidentifyBoundariesOf(imported, ['1000', '1001', '31000', '31001'])
  for (const rid of ['1000', '31000']) {
    const rec = imported.sidecar.roadRecords![rid]
    const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])!
    lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }
  }
  return imported
}

describe('shapes a local prediction has to reproduce', () => {
  // Junctions 2000 and 2001 are rejected on the way; their demand for road
  // 1001's -2 side has to stop counting the moment they go, or 1001's id lands
  // on the -2 group, junction 2002 is dropped as unresolvable, and the
  // <signal> on the unedited road 1002 goes with it. Nothing about the input
  // is unusual: the same document with the two lanes the other way round was
  // already correct.
  it('a rejected junction stops demanding a side of a split road', () => {
    const { out } = exportOf(orderReversedPartialLaneLink())
    expect(maskDate(out)).toBe(golden('chain8-partial-lanelink-reversed.xodr'))
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out.match(/<road\b[^>]*\bid="1002"[^>]*>/)![0]).toMatch(/\bjunction="2002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
  })

  // Two junctions name opposite sides of road 1001. Only one of them can have
  // the road's id, so the other is rejected — and the survivor's demand is the
  // one that has to decide, which a set merged per road cannot express.
  it('two junctions naming opposite sides of one road', () => {
    const { out } = exportOf(twoJunctionChain())
    expect(maskDate(out)).toBe(golden('chain8-two-junction.xodr'))
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out.match(/<road\b[^>]*\bid="1002"[^>]*>/)![0]).toMatch(/\bjunction="2002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
  })

  // A lane of road 1001 and a lane of road 31001 share a boundary and come
  // back as ONE bundle. Judging road 31001 by its own recorded lanes says it
  // stands alone and renumbers -2 to -1, which drops junction 32002 and the
  // <signal> on the unedited road 31002.
  it('a bundle that spans two roads', () => {
    const { out } = exportOf(crossRoadBundleChain())
    expect(maskDate(out)).toBe(golden('chain8-cross-road-bundle.xodr'))
    // Both chains keep the junction whose table names only one lane, and the
    // signal that exists only in its member road's carried text.
    expect(out).toMatch(/<junction\b[^>]*\bid="2002"/)
    expect(out).toMatch(/<junction\b[^>]*\bid="32002"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="500"/)
    expect(out).toMatch(/<signal\b[^>]*\bid="30500"/)
    expect(out.match(/<road\b[^>]*\bid="31002"[^>]*>/)![0]).toMatch(/\bjunction="32002"/)
  })

  // A settled plan emits no reference it cannot resolve. Deciding a road's id
  // a second time, after the bundles were built, left a <laneLink> naming a
  // lane number the emitted road had renumbered away — a defect no byte
  // comparison of a DIFFERENT document would have caught, so it is checked
  // directly here.
  it('emits no unresolvable reference on the split-road shapes', () => {
    for (const [name, inputXml, build] of [
      ['order-reversed', partialLaneLinkChainXodr(), orderReversedPartialLaneLink],
      ['cross-road bundle', crossRoadBundleChainXodr(), crossRoadBundleChain],
    ] as const) {
      // The input first, so a defect in the document is not blamed on export.
      expect({ [name]: brokenRefs(inputXml) }).toEqual({ [name]: [] })
      const { out } = exportOf(build())
      expect({ [name]: brokenRefs(out) }).toEqual({ [name]: [] })
    }
  })

  // Known limit, stated rather than hidden: when a junction's rejection
  // renumbers a road, a VERBATIM neighbour's <laneLink> still names the lane
  // number it had. Carried text is not rewritten for a lane that went away, so
  // road 1002 keeps a `<predecessor id="-2"/>` into a road 1001 that came back
  // with one lane. The whole re-plan has always emitted this; it is a gap in
  // the carry rewrite, not in the fixpoint, and it is pinned so that a change
  // in either direction is visible.
  it('still carries a lane link into a lane a split took away', () => {
    const inputXml = withSidecarOnlySignal(
      chainVariantXodr({
        junctionCount: 8,
        sides: ['both', 'both', 'first', 'both', 'both', 'both', 'both', 'both'],
        twinAt: [2],
      }),
      '1002',
      '500'
    )
    expect(brokenRefs(inputXml)).toEqual([])
    const { out } = exportOf(twoJunctionChain())
    expect(brokenRefs(out)).toEqual([
      'ref.dangling-lane-link: road 1002 lane section 0 lane -2 <predecessor> names lane -2, ' +
        'which does not exist in road 1001 at its end',
    ])
  })
})
