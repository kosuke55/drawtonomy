import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { evalElevation, sampleReferenceLine } from '../../src/exporter/odrGeometry'
import { fitElevationProfile, evalElevationRecords } from '../../src/exporter/odrElevationFit'
import type { DrawtonomySnapshot } from '../../src/types'

/** A straight road climbing from 12 m to ~15 m over 100 m, in two segments. */
const SLOPED_ROAD = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="sloped" length="100" id="1" junction="-1">
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry>
    </planView>
    <elevationProfile>
      <elevation s="0" a="12.0" b="0.02" c="0.0001" d="-0.0000005"/>
      <elevation s="50" a="13.2" b="0.03" c="-0.0002" d="0.0000004"/>
    </elevationProfile>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-2" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

/** Same road with no <elevationProfile> at all. */
const FLAT_ROAD = SLOPED_ROAD.replace(/<elevationProfile>[\s\S]*?<\/elevationProfile>/, '')

/**
 * A road whose elevation profile starts at height 0 (a = 0, b = 0 at s = 0)
 * but is not flat further along — the pattern real vertical-curve maps use
 * at a station-0 record (e.g. a sag starting level before climbing). This
 * used to collide with the "z === 0 means no elevation" heuristic: the very
 * first sample legitimately evaluates to exactly 0.
 */
const ZERO_START_ROAD = SLOPED_ROAD.replace(
  /<elevationProfile>[\s\S]*?<\/elevationProfile>/,
  '<elevationProfile>' +
    '<elevation s="0" a="0" b="0" c="0.0006" d="0"/>' +
    '<elevation s="50" a="1.5" b="0.04" c="0" d="0"/>' +
    '</elevationProfile>'
)

/** All records present but numerically flat (a = b = c = d = 0 everywhere). */
const ALL_ZERO_RECORD_ROAD = SLOPED_ROAD.replace(
  /<elevationProfile>[\s\S]*?<\/elevationProfile>/,
  '<elevationProfile><elevation s="0" a="0" b="0" c="0" d="0"/></elevationProfile>'
)

/** Build a snapshot from an odrToShapes result, carrying point heights. */
function snapshotOf(xml: string): DrawtonomySnapshot {
  const imported = odrToShapes(parseOpenDriveXml(xml))
  const shapes: unknown[] = []
  for (const p of imported.points) {
    shapes.push({
      id: p.id,
      type: 'point',
      x: p.x,
      y: p.y,
      rotation: 0,
      zIndex: 0,
      props: { color: 'black', visible: true, osmId: p.osmId, ...(p.z !== undefined ? { z: p.z } : {}) },
    })
  }
  for (const ls of imported.linestrings) {
    shapes.push({
      id: ls.id,
      type: 'linestring',
      x: ls.x,
      y: ls.y,
      rotation: 0,
      zIndex: 0,
      props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId },
    })
  }
  for (const lane of imported.lanes) {
    shapes.push({
      id: lane.id,
      type: 'lane',
      x: lane.x,
      y: lane.y,
      rotation: 0,
      zIndex: 0,
      props: {
        leftBoundaryId: lane.leftBoundaryId,
        rightBoundaryId: lane.rightBoundaryId,
        invertLeft: lane.invertLeft,
        invertRight: lane.invertRight,
        color: 'default',
        size: 'm',
        attributes: lane.attributes,
        next: lane.next,
        prev: lane.prev,
        osmId: lane.osmId,
      },
    })
  }
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
  }
}

/**
 * Nudge one point sideways in a snapshot, simulating a user edit that
 * disqualifies the road from the verbatim carry-through path (this test
 * suite's snapshots have no sidecar, so exportToOpenDrive always goes
 * through the fitting exporter — this just documents intent).
 */
function moveOnePoint(snapshot: DrawtonomySnapshot): DrawtonomySnapshot {
  const shapes = snapshot.shapes.map(s => (s.type === 'point' ? { ...s, x: s.x + 1 } : s))
  const idx = shapes.findIndex(s => s.type === 'point')
  if (idx === -1) throw new Error('no point shape to move')
  return { ...snapshot, shapes }
}

describe('elevation parsing', () => {
  it('retains <elevation> records and evaluates them piecewise', () => {
    const map = parseOpenDriveXml(SLOPED_ROAD)
    const road = map.roads[0]
    expect(road.elevations).toHaveLength(2)
    expect(road.hasElevation).toBe(true)
    // First segment at s = 0 is the record's own `a`.
    expect(evalElevation(road.elevations, 0)).toBeCloseTo(12.0, 9)
    // At s = 10 (still in segment 1): 12 + 0.02*10 + 1e-4*100 - 5e-7*1000
    expect(evalElevation(road.elevations, 10)).toBeCloseTo(12 + 0.2 + 0.01 - 0.0005, 9)
    // At s = 50 the second record takes over.
    expect(evalElevation(road.elevations, 50)).toBeCloseTo(13.2, 9)
    // Before the first record the profile is 0 (no extrapolation).
    expect(evalElevation(road.elevations, -5)).toBe(0)
  })

  it('treats an all-zero profile as no elevation', () => {
    const xml = SLOPED_ROAD.replace(
      /<elevationProfile>[\s\S]*?<\/elevationProfile>/,
      '<elevationProfile><elevation s="0" a="0" b="0" c="0" d="0"/></elevationProfile>'
    )
    const road = parseOpenDriveXml(xml).roads[0]
    expect(road.elevations).toHaveLength(1)
    expect(road.hasElevation).toBe(false)
  })

  it('every sample carries the reference-line height', () => {
    const road = parseOpenDriveXml(SLOPED_ROAD).roads[0]
    const samples = sampleReferenceLine(road)
    for (const s of samples) {
      expect(s.z).toBeCloseTo(evalElevation(road.elevations, s.s), 9)
    }
  })

  // Regression pin: elevation records must not perturb the 2D station set.
  // CARLA exports carry dense all-zero records; when those were inserted as
  // stations they shifted the plan-view fit of short junction roads enough
  // to open contact-point gaps (ASAM QC lane_smoothness failure on Town01).
  it('elevation records leave the 2D station set unchanged', () => {
    // Breakpoints deliberately off the 5 m base-station grid — an on-grid
    // breakpoint dedupes against an existing station and hides the bug.
    const offGrid = SLOPED_ROAD.replace(
      /<elevationProfile>[\s\S]*?<\/elevationProfile>/,
      '<elevationProfile>' +
        '<elevation s="0" a="12" b="0.02" c="0" d="0"/>' +
        '<elevation s="2.3897" a="12.05" b="0.02" c="0" d="0"/>' +
        '<elevation s="47.31" a="12.9" b="0.02" c="0" d="0"/>' +
        '</elevationProfile>'
    )
    const withElev = parseOpenDriveXml(offGrid).roads[0]
    const noElev = parseOpenDriveXml(
      offGrid.replace(/<elevationProfile>[\s\S]*?<\/elevationProfile>/, '')
    ).roads[0]
    const a = sampleReferenceLine(withElev)
    const b = sampleReferenceLine(noElev)
    expect(a.map(p => p.s)).toEqual(b.map(p => p.s))
    expect(a.map(p => [p.x, p.y, p.hdg])).toEqual(b.map(p => [p.x, p.y, p.hdg]))
  })
})

describe('elevation on imported points', () => {
  it('stamps the reference-line height on every boundary point', () => {
    const road = parseOpenDriveXml(SLOPED_ROAD).roads[0]
    const imported = odrToShapes(parseOpenDriveXml(SLOPED_ROAD))
    expect(imported.points.length).toBeGreaterThan(0)
    const zs = imported.points.map(p => p.z)
    expect(zs.every(z => typeof z === 'number')).toBe(true)
    const min = Math.min(...(zs as number[]))
    const max = Math.max(...(zs as number[]))
    // The profile spans roughly 12 m .. 15 m.
    expect(min).toBeGreaterThan(11.5)
    expect(max).toBeLessThan(16)
    expect(max - min).toBeGreaterThan(1)
    // Height comes only from the profile, so the extremes match its ends.
    expect(min).toBeCloseTo(evalElevation(road.elevations, 0), 6)
  })

  it('leaves points height-free when the road has no elevation profile', () => {
    const imported = odrToShapes(parseOpenDriveXml(FLAT_ROAD))
    expect(imported.points.length).toBeGreaterThan(0)
    expect(imported.points.every(p => p.z === undefined)).toBe(true)
  })
})

describe('fitElevationProfile', () => {
  it('emits nothing for empty / all-flat samples', () => {
    expect(fitElevationProfile([])).toEqual([])
    expect(fitElevationProfile([{ s: 0, z: 0 }, { s: 10, z: 0 }])).toEqual([])
  })

  it('fits a constant grade with a single record', () => {
    const samples = Array.from({ length: 11 }, (_, i) => ({ s: i * 10, z: 5 + 0.02 * i * 10 }))
    const records = fitElevationProfile(samples)
    expect(records).toHaveLength(1)
    expect(records[0].s).toBe(0)
    expect(records[0].a).toBeCloseTo(5, 6)
    expect(records[0].b).toBeCloseTo(0.02, 6)
  })

  it('reproduces every sample within tolerance for a curved profile', () => {
    const samples = Array.from({ length: 41 }, (_, i) => {
      const s = i * 2.5
      return { s, z: 10 + 3 * Math.sin(s / 30) }
    })
    const records = fitElevationProfile(samples)
    expect(records.length).toBeGreaterThan(0)
    expect(records[0].s).toBe(0)
    for (const smp of samples) {
      expect(Math.abs(evalElevationRecords(records, smp.s) - smp.z)).toBeLessThanOrEqual(0.05)
    }
  })

  it('starts the profile at s = 0 even when samples start later', () => {
    const records = fitElevationProfile([{ s: 4, z: 7 }, { s: 20, z: 8 }])
    expect(records[0].s).toBe(0)
  })
})

describe('elevation round-trip (import -> export)', () => {
  it('re-emits a height profile that matches the source within 5 cm', () => {
    const source = parseOpenDriveXml(SLOPED_ROAD).roads[0]
    const xml = exportToOpenDrive(snapshotOf(SLOPED_ROAD))
    expect(xml).toContain('<elevationProfile>')
    const out = parseOpenDriveXml(xml).roads[0]
    expect(out.elevations.length).toBeGreaterThan(0)
    expect(out.hasElevation).toBe(true)
    // Compare along the road: the exported reference line is the leftmost
    // boundary, so stations shift slightly; sample by fraction of length.
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const srcZ = evalElevation(source.elevations, f * source.length)
      const outZ = evalElevation(out.elevations, f * out.length)
      expect(Math.abs(outZ - srcZ)).toBeLessThanOrEqual(0.05)
    }
  })

  it('keeps emitting an empty profile for roads with no height', () => {
    const xml = exportToOpenDrive(snapshotOf(FLAT_ROAD))
    expect(xml).toContain('<elevationProfile/>')
    expect(xml).not.toContain('<elevation ')
  })
})

// Regression: issue #984. A regenerated road (its shapes were edited, so it
// cannot be re-emitted verbatim) used to lose its <elevationProfile> even
// though its source profile was not flat, because of two independent bugs:
//
//   1. odrToShapes stripped z = 0 off every point unconditionally, so a
//      profile that legitimately evaluates to exactly 0 at some station
//      (e.g. a = b = 0 at s = 0) came back looking height-free there.
//   2. exportToOpenDrive discarded ALL elevation samples for a road if even
//      one boundary point was missing z, instead of only the un-annotated
//      stretch.
describe('elevation survives regeneration after an edit (#984)', () => {
  it('keeps the elevation record for a profile that starts at height 0', () => {
    const source = parseOpenDriveXml(ZERO_START_ROAD).roads[0]
    expect(source.hasElevation).toBe(true)
    // Sanity: the source really does evaluate to exactly 0 at s = 0, the
    // condition that used to be indistinguishable from "no elevation".
    expect(evalElevation(source.elevations, 0)).toBe(0)

    const edited = moveOnePoint(snapshotOf(ZERO_START_ROAD))
    const xml = exportToOpenDrive(edited)
    expect(xml).toContain('<elevationProfile>')
    expect(xml).toContain('<elevation ')

    const out = parseOpenDriveXml(xml).roads[0]
    expect(out.hasElevation).toBe(true)
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const srcZ = evalElevation(source.elevations, f * source.length)
      const outZ = evalElevation(out.elevations, f * out.length)
      expect(Math.abs(outZ - srcZ)).toBeLessThanOrEqual(0.05)
    }
  })

  it('does not fabricate elevation for a genuinely flat road after an edit', () => {
    // Regression guard for the fix above: a road whose profile really is
    // flat (all-zero record, road.hasElevation === false) must still round
    // trip to an empty <elevationProfile/> — the "no elevation" convention
    // is a semantic call (a=b=c=d=0), not an artifact of dropping z = 0.
    const edited = moveOnePoint(snapshotOf(ALL_ZERO_RECORD_ROAD))
    const xml = exportToOpenDrive(edited)
    expect(xml).toContain('<elevationProfile/>')
    expect(xml).not.toContain('<elevation ')
  })

  it('does not fabricate elevation for a road with no profile at all after an edit', () => {
    const edited = moveOnePoint(snapshotOf(FLAT_ROAD))
    const xml = exportToOpenDrive(edited)
    expect(xml).toContain('<elevationProfile/>')
    expect(xml).not.toContain('<elevation ')
  })

  it('tolerates an isolated missing z sample without discarding the whole profile', () => {
    // Simulates the e6mini pattern: 410 of 411 stations carry a fitted z,
    // only the very first (s = 0, z = 0 exactly under the old heuristic)
    // came back undefined. Build a snapshot directly (bypassing odrToShapes)
    // so the gap is deliberate and isolated, then confirm the exporter fills
    // it by interpolation instead of discarding every other sample.
    const imported = odrToShapes(parseOpenDriveXml(SLOPED_ROAD))
    const shapes: unknown[] = []
    let firstPointSeen = false
    for (const p of imported.points) {
      const dropZ = !firstPointSeen
      firstPointSeen = true
      shapes.push({
        id: p.id,
        type: 'point',
        x: p.x,
        y: p.y,
        rotation: 0,
        zIndex: 0,
        props: {
          color: 'black',
          visible: true,
          osmId: p.osmId,
          ...(dropZ || p.z === undefined ? {} : { z: p.z }),
        },
      })
    }
    for (const ls of imported.linestrings) {
      shapes.push({
        id: ls.id,
        type: 'linestring',
        x: ls.x,
        y: ls.y,
        rotation: 0,
        zIndex: 0,
        props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId },
      })
    }
    for (const lane of imported.lanes) {
      shapes.push({
        id: lane.id,
        type: 'lane',
        x: lane.x,
        y: lane.y,
        rotation: 0,
        zIndex: 0,
        props: {
          leftBoundaryId: lane.leftBoundaryId,
          rightBoundaryId: lane.rightBoundaryId,
          invertLeft: lane.invertLeft,
          invertRight: lane.invertRight,
          color: 'default',
          size: 'm',
          attributes: lane.attributes,
          next: lane.next,
          prev: lane.prev,
          osmId: lane.osmId,
        },
      })
    }
    const snapshot: DrawtonomySnapshot = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      shapes: shapes as DrawtonomySnapshot['shapes'],
    }
    const xml = exportToOpenDrive(moveOnePoint(snapshot))
    expect(xml).toContain('<elevationProfile>')
    expect(xml).toContain('<elevation ')
    const out = parseOpenDriveXml(xml).roads[0]
    expect(out.hasElevation).toBe(true)
  })
})
