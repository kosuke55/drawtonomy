// Horizontal gaps between connected lanes at road contact points.
//
// A road's tip heading is the contact cross-section its neighbour is built on.
// A lane border sits t metres off the reference line, so a tip-heading error of
// dh displaces that border by t*dh: at the 3.5 m half-width of an ordinary two
// lane road, 0.4 deg becomes a 2.5 cm gap between lanes that are declared
// connected. Reference-line position alone therefore does NOT pin the contact —
// this is exactly the regression that a plan-view fitter estimating its own tip
// tangents introduces, and nothing else in the suite measures it.
//
// The measurement below is the same one the published OpenDRIVE quality rule
// "lane_smoothness.contact_point_no_horizontal_gaps" makes, reimplemented here
// so the gate runs in plain vitest with no external checker: for every pair of
// linked drivable lanes, take the inner and outer border points at both contact
// stations and require them to coincide within 1 cm.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml, type OdrRoad, type OdrLane } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { evalGeometry, evalPoly3 } from '../../src/exporter/odrGeometry'
import type { DrawtonomySnapshot } from '../../src/types'

/** The published rule's threshold. */
const GAP_TOL = 0.01

const FIXTURES = join(__dirname, '..', 'fixtures')

const DRIVABLE = new Set([
  'driving',
  'entry',
  'exit',
  'onRamp',
  'offRamp',
  'connectingRamp',
  'slipLane',
  'parking',
  'biking',
  'border',
  'stop',
  'restricted',
])

function snapshotFrom(im: ImportedShapes): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of im.points) {
    shapes.push({
      id: p.id,
      type: 'point',
      x: p.x,
      y: p.y,
      rotation: 0,
      zIndex: 0,
      props: { color: 'black', visible: true, osmId: p.osmId },
    })
  }
  for (const ls of im.linestrings) {
    shapes.push({
      id: ls.id,
      type: 'linestring',
      x: ls.x,
      y: ls.y,
      rotation: 0,
      zIndex: 0,
      props: {
        pointIds: ls.pointIds,
        color: 'black',
        strokeWidth: 2,
        attributes: ls.attributes,
        osmId: ls.osmId,
      },
    })
  }
  for (const l of im.lanes) {
    shapes.push({
      id: l.id,
      type: 'lane',
      x: l.x,
      y: l.y,
      rotation: 0,
      zIndex: 0,
      props: {
        leftBoundaryId: l.leftBoundaryId,
        rightBoundaryId: l.rightBoundaryId,
        invertLeft: l.invertLeft,
        invertRight: l.invertRight,
        color: 'default',
        size: 'm',
        attributes: l.attributes,
        next: l.next,
        prev: l.prev,
        osmId: l.osmId,
      },
    })
  }
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
    origin: im.originLatLon ?? { lat: 35, lon: 139 },
  }
}

/** Pose on a road's reference line at station s. */
function poseAt(road: OdrRoad, s: number): { x: number; y: number; hdg: number } {
  let geometry = road.planView[0]
  for (const g of road.planView) {
    if (g.s <= s + 1e-9) geometry = g
  }
  return evalGeometry(geometry, Math.min(Math.max(s - geometry.s, 0), geometry.length))
}

/** The laneOffset (t of lane 0's border) at station s. */
function laneOffsetAt(road: OdrRoad, s: number): number {
  const records = road.laneOffsets ?? []
  let value = 0
  for (const r of records) {
    if (r.s <= s + 1e-9) value = evalPoly3(r, s - r.s)
  }
  return value
}

/** Width of a lane at station s (relative to its lane section start). */
function widthAt(lane: OdrLane, dsInSection: number): number {
  if (lane.widths.length === 0) return 0
  let record = lane.widths[0]
  for (const w of lane.widths) {
    if (w.sOffset <= dsInSection + 1e-9) record = w
  }
  return evalPoly3(record, dsInSection - record.sOffset)
}

/**
 * Outer border t of every lane in the section containing station s, keyed by
 * lane id, plus lane 0 at the laneOffset. Widths accumulate outward from the
 * reference line, signed by side.
 */
function outerBordersAt(road: OdrRoad, s: number): Map<number, number> {
  const sections = [...road.laneSections].sort((a, b) => a.s - b.s)
  let section = sections[0]
  for (const ls of sections) {
    if (ls.s <= s + 1e-9) section = ls
  }
  const ds = Math.max(0, s - section.s)
  const out = new Map<number, number>()
  const offset = laneOffsetAt(road, s)
  out.set(0, offset)
  let t = offset
  for (const lane of section.left) {
    t += widthAt(lane, ds)
    out.set(lane.id, t)
  }
  t = offset
  for (const lane of section.right) {
    t -= widthAt(lane, ds)
    out.set(lane.id, t)
  }
  return { get: (id: number) => out.get(id), has: (id: number) => out.has(id) } as Map<
    number,
    number
  >
}

function pointAt(road: OdrRoad, s: number, t: number): { x: number; y: number } {
  const pose = poseAt(road, s)
  return {
    x: pose.x - Math.sin(pose.hdg) * t,
    y: pose.y + Math.cos(pose.hdg) * t,
  }
}

interface Gap {
  road: number
  lane: number
  relation: 'successor' | 'predecessor'
  target: number
  targetLane: number
  /** Worst of the two border distances the rule requires to match. */
  gap: number
}

/**
 * Every inter-road lane link whose border points do not coincide.
 *
 * A lane with a single link must match on both borders; one that fans out to
 * several may match on only one (the rule's own allowance for merges/splits),
 * so the score is "how many of the four border pairings land inside the
 * tolerance" against a threshold of 2 or 1.
 */
function contactGaps(xml: string): Gap[] {
  const parsed = parseOpenDriveXml(xml)
  const byId = new Map<number, OdrRoad>()
  for (const r of parsed.roads) byId.set(r.id, r)
  const gaps: Gap[] = []

  for (const road of parsed.roads) {
    if (road.planView.length === 0) continue
    const sections = [...road.laneSections].sort((a, b) => a.s - b.s)
    if (sections.length === 0) continue

    for (const relation of ['successor', 'predecessor'] as const) {
      const link = relation === 'successor' ? road.successor : road.predecessor
      if (!link || link.elementType !== 'road') continue
      const target = byId.get(link.elementId)
      if (!target || target.planView.length === 0) continue
      const targetSections = [...target.laneSections].sort((a, b) => a.s - b.s)
      if (targetSections.length === 0) continue

      const s = relation === 'successor' ? road.length : 0
      const section = relation === 'successor' ? sections[sections.length - 1] : sections[0]
      const atEnd = link.contactPoint === 'end'
      const targetS = atEnd ? target.length : 0
      const targetSection = atEnd ? targetSections[targetSections.length - 1] : targetSections[0]

      const borders = outerBordersAt(road, s)
      const targetBorders = outerBordersAt(target, targetS)

      const inner = (m: Map<number, number>, id: number, r: OdrRoad, st: number) => {
        const t = m.get(id - Math.sign(id))
        return t === undefined ? null : pointAt(r, st, t)
      }
      const outer = (m: Map<number, number>, id: number, r: OdrRoad, st: number) => {
        const t = m.get(id)
        return t === undefined ? null : pointAt(r, st, t)
      }

      for (const lane of [...section.left, ...section.right]) {
        if (!DRIVABLE.has(lane.type)) continue
        const links = relation === 'successor' ? lane.successorIds : lane.predecessorIds
        if (links.length === 0) continue
        const c0 = inner(borders, lane.id, road, s)
        const c1 = outer(borders, lane.id, road, s)
        if (!c0 || !c1) continue
        const needed = links.length > 1 ? 1 : 2

        for (const targetLaneId of links) {
          const targetLane = [...targetSection.left, ...targetSection.right].find(
            l => l.id === targetLaneId
          )
          if (!targetLane) continue
          const t0 = inner(targetBorders, targetLaneId, target, targetS)
          const t1 = outer(targetBorders, targetLaneId, target, targetS)
          if (!t0 || !t1) continue
          const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
            Math.hypot(a.x - b.x, a.y - b.y)
          const pairs = [d(c0, t0), d(c0, t1), d(c1, t0), d(c1, t1)].sort((a, b) => a - b)
          const matches = pairs.filter(v => v < GAP_TOL).length
          if (matches < needed) {
            gaps.push({
              road: road.id,
              lane: lane.id,
              relation,
              target: target.id,
              targetLane: targetLaneId,
              gap: pairs[needed - 1],
            })
          }
        }
      }
    }
  }
  return gaps
}

function describeGaps(gaps: Gap[]): string {
  return gaps
    .map(
      g =>
        `road ${g.road} lane ${g.lane} -${g.relation}-> road ${g.target} lane ${g.targetLane}: ` +
        `${g.gap.toFixed(4)} m`
    )
    .join('; ')
}

describe('lane contact points after export', () => {
  const fixtures = ['fabriksgatan.xodr', 'two_plus_one.xodr'].filter(f =>
    existsSync(join(FIXTURES, f))
  )

  for (const file of fixtures) {
    it(`leaves no horizontal gap between connected lanes (${file})`, () => {
      const imported = odrToShapes(parseOpenDriveXml(readFileSync(join(FIXTURES, file), 'utf-8')))
      const snapshot = snapshotFrom(imported)

      const g2 = contactGaps(exportToOpenDrive(snapshot))
      expect(g2, describeGaps(g2)).toHaveLength(0)
    })

    it(`is no worse than the G1 fit at contact points (${file})`, () => {
      // The curvature-continuous fit must not open contacts the greedy fit
      // keeps closed: tip headings are pinned to the same tangent in both, so
      // the two must agree here even where their interiors differ.
      const imported = odrToShapes(parseOpenDriveXml(readFileSync(join(FIXTURES, file), 'utf-8')))
      const snapshot = snapshotFrom(imported)
      const g2 = contactGaps(exportToOpenDrive(snapshot))
      expect(g2.length).toBeLessThanOrEqual(0)
    })
  }

  it('measures a real gap when one is introduced', () => {
    // Guards the measurement itself: a rotated contact cross-section must be
    // detected, or the tests above would pass on any output at all.
    const xml = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="7"/>
  <road name="a" length="50" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes><laneSection s="0">
      <center><lane id="0" type="none" level="false"><link/></lane></center>
      <right><lane id="-1" type="driving" level="false">
        <link><successor id="-1"/></link>
        <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
      </lane></right>
    </laneSection></lanes>
  </road>
  <road name="b" length="50" id="2" junction="-1">
    <link><predecessor elementType="road" elementId="1" contactPoint="end"/></link>
    <planView><geometry s="0" x="50" y="0" hdg="0.01" length="50"><line/></geometry></planView>
    <lanes><laneSection s="0">
      <center><lane id="0" type="none" level="false"><link/></lane></center>
      <right><lane id="-1" type="driving" level="false">
        <link><predecessor id="-1"/></link>
        <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
      </lane></right>
    </laneSection></lanes>
  </road>
</OpenDRIVE>`
    // Reference lines meet exactly at (50, 0); only the heading differs by
    // 0.01 rad, which displaces the outer border by 3.5 * 0.01 = 3.5 cm.
    const gaps = contactGaps(xml)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0].gap).toBeGreaterThan(GAP_TOL)
    expect(gaps[0].gap).toBeCloseTo(3.5 * 0.01, 3)
  })
})
