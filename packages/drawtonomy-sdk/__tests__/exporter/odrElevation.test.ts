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

  it('pins a station on every elevation breakpoint', () => {
    const road = parseOpenDriveXml(SLOPED_ROAD).roads[0]
    const samples = sampleReferenceLine(road)
    expect(samples.some(s => Math.abs(s.s - 50) < 1e-9)).toBe(true)
    // Every sample carries the reference-line height.
    for (const s of samples) {
      expect(s.z).toBeCloseTo(evalElevation(road.elevations, s.s), 9)
    }
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
