// Gaps in the per-point height annotation.
//
// A regenerated road's <elevationProfile> is refitted from the z carried on
// the reference boundary's vertices. Some of those vertices can be missing
// z (a point shared with another linestring, a boundary aligner weld, a
// hand-drawn extension of an imported road). The exporter has to tell apart
//
//   * a hole — one or two missing vertices between annotated neighbours
//     close by, where the height is genuinely recoverable by interpolation;
//   * an un-annotated stretch — tens of metres with no data, where any
//     emitted height is invented.
//
// Fabricating the second case is worse than emitting no profile: it writes a
// confident cliff or ramp into the map.
import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { evalElevation } from '../../src/exporter/odrGeometry'
import { resolveElevationGaps, type GapSample } from '../../src/exporter/odrElevationFit'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'

/**
 * A straight one-lane snapshot whose boundaries have a vertex at each given
 * station (m) carrying the matching height (m); `undefined` means the vertex
 * has no height at all. The canvas runs +x eastward, so a vertex at station
 * `s` sits at x = s * PIXELS_PER_METER and the road is `max(stations)` long.
 */
function straightLane(
  stations: readonly number[],
  zs: readonly (number | undefined)[]
): DrawtonomySnapshot {
  const shapes: unknown[] = []
  const point = (id: string, sMeters: number, tMeters: number, z: number | undefined): void => {
    shapes.push({
      id,
      type: 'point',
      x: sMeters * PIXELS_PER_METER,
      y: tMeters * PIXELS_PER_METER,
      rotation: 0,
      zIndex: 0,
      props: { color: 'black', visible: true, osmId: '', ...(z !== undefined ? { z } : {}) },
    })
  }
  const leftIds: string[] = []
  const rightIds: string[] = []
  stations.forEach((s, i) => {
    point(`pl${i}`, s, 0, zs[i])
    point(`pr${i}`, s, 3.5, zs[i])
    leftIds.push(`pl${i}`)
    rightIds.push(`pr${i}`)
  })
  for (const [id, pointIds] of [['bl', leftIds], ['br', rightIds]] as const) {
    shapes.push({
      id,
      type: 'linestring',
      x: 0,
      y: 0,
      rotation: 0,
      zIndex: 0,
      props: { pointIds, color: 'black', strokeWidth: 2, attributes: {}, osmId: '' },
    })
  }
  shapes.push({
    id: 'lane0',
    type: 'lane',
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    props: {
      leftBoundaryId: 'bl',
      rightBoundaryId: 'br',
      invertLeft: false,
      invertRight: false,
      color: 'default',
      size: 'm',
      attributes: {},
      next: [],
      prev: [],
      osmId: '',
    },
  })
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
  }
}

/** Export the snapshot and return its single road plus a height probe. */
function exportedProfile(snapshot: DrawtonomySnapshot) {
  const xml = exportToOpenDrive(snapshot)
  const map = parseOpenDriveXml(xml)
  expect(map.roads).toHaveLength(1)
  const road = map.roads[0]
  return {
    xml,
    road,
    /** Height at a fraction of the road, so the station rescale cancels. */
    at: (fraction: number): number => evalElevation(road.elevations, fraction * road.length),
  }
}

describe('resolveElevationGaps', () => {
  const mk = (stations: readonly number[], zs: readonly (number | undefined)[]): GapSample[] =>
    stations.map((s, i) => ({ s, z: zs[i] }))

  it('interpolates an interior hole by station, not by array index', () => {
    // Stations 0 / 1 / 100 with the middle vertex unannotated. Index-space
    // interpolation puts the hole halfway in value (50); station space puts
    // it 1% along (1).
    const out = resolveElevationGaps(mk([0, 1, 100], [0, undefined, 100]), 100)
    expect(out).not.toBeNull()
    expect(out!.find(smp => smp.s === 1)!.z).toBeCloseTo(1, 9)
  })

  it('interpolates a two-vertex hole at unequal spacing', () => {
    // 0 @ 0 m, holes at 2 m and 8 m, 10 @ 10 m: a 1 m/m grade.
    const out = resolveElevationGaps(mk([0, 2, 8, 10], [0, undefined, undefined, 10]), 10)
    expect(out).not.toBeNull()
    expect(out!.find(smp => smp.s === 2)!.z).toBeCloseTo(2, 9)
    expect(out!.find(smp => smp.s === 8)!.z).toBeCloseTo(8, 9)
  })

  it('refuses a hole whose stations are far from every known height', () => {
    // Stations every 20 m with only the ends annotated: the vertices at
    // 40 m and 60 m are 40 m from the nearest datum, so their height is a
    // guess, not a reconstruction.
    const out = resolveElevationGaps(
      mk([0, 20, 40, 60, 80, 100], [0, undefined, undefined, undefined, undefined, 100]),
      100
    )
    expect(out).toBeNull()
  })

  it('refuses a run of more consecutive unannotated vertices than the budget', () => {
    // Four consecutive holes, each individually close to a datum: the run
    // as a whole still drops more detail than a weld or a shared point can
    // explain, so it is an unannotated stretch.
    const out = resolveElevationGaps(
      mk([0, 2, 4, 6, 8, 10], [0, undefined, undefined, undefined, undefined, 10]),
      10
    )
    expect(out).toBeNull()
  })

  it('holds the last known height across a short unannotated end stub', () => {
    // The e6mini pattern: the very first vertex lost its z. The stub is one
    // station long, so the profile still covers the road — held flat, with
    // no grade extrapolated backwards.
    const out = resolveElevationGaps(mk([0, 4, 8, 12], [undefined, 10, 20, 30]), 12)
    expect(out).not.toBeNull()
    expect(out!.find(smp => smp.s === 0)!.z).toBeCloseTo(10, 9)
  })

  it('emits nothing when an end stub is too long to cover', () => {
    // 40 m of road before the first annotated vertex. Neither holding nor
    // extrapolating is defensible over that distance.
    expect(resolveElevationGaps(mk([0, 40, 50, 60], [undefined, 10, 20, 30]), 60)).toBeNull()
    expect(resolveElevationGaps(mk([0, 10, 20, 60], [10, 20, 30, undefined]), 60)).toBeNull()
  })

  it('emits nothing when no vertex carries a height', () => {
    expect(resolveElevationGaps(mk([0, 10, 20], [undefined, undefined, undefined]), 20)).toBeNull()
  })

  it('passes a fully annotated boundary through unchanged', () => {
    const out = resolveElevationGaps(mk([0, 10, 20], [1, 2, 3]), 20)
    expect(out).toEqual([{ s: 0, z: 1 }, { s: 10, z: 2 }, { s: 20, z: 3 }])
  })
})

describe('un-annotated stretches at the road ends (#8)', () => {
  it('does not extrapolate a profile into an un-annotated head and tail', () => {
    // Review repro: a 100 m road annotated only between 20 m and 40 m. The
    // fitter extends its first record back to s = 0 and its last record runs
    // to the road end, so handing it just the annotated middle produced
    // 10 m at s = 0 and -130 m at s = 100 — a 150 m cliff out of two points.
    const { xml, road, at } = exportedProfile(
      straightLane([0, 20, 40, 100], [undefined, 10, 20, undefined])
    )
    if (road.hasElevation) {
      // If a profile is emitted at all it must stay inside the observed
      // 10..20 m band; nothing in the input supports a height outside it.
      for (const f of [0, 0.1, 0.5, 0.8, 1]) {
        expect(at(f)).toBeGreaterThanOrEqual(10 - 1)
        expect(at(f)).toBeLessThanOrEqual(20 + 1)
      }
    } else {
      expect(xml).toContain('<elevationProfile/>')
    }
  })

  it('keeps the profile when only a short end stub is unannotated', () => {
    // A 40 m road on a 0.5 m/m grade whose first vertex lost its z. The
    // remaining 30 m of data still describe the road, so the profile must
    // survive (this is the regression the branch exists for) and must match
    // the known samples.
    const { road, at } = exportedProfile(
      straightLane([0, 10, 20, 30, 40], [undefined, 5, 10, 15, 20])
    )
    expect(road.hasElevation).toBe(true)
    // 10 cm: the fitter's own 5 cm height tolerance plus the station rescale
    // between the drawn boundary and the fitted reference line.
    expect(Math.abs(at(10 / 40) - 5)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(at(20 / 40) - 10)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(at(1) - 20)).toBeLessThanOrEqual(0.1)
    // The head is held at the first known height, never run backwards down
    // the grade (which would reach 0 m at s = 0).
    expect(at(0)).toBeGreaterThanOrEqual(5 - 0.1)
  })
})

describe('interior holes (#9)', () => {
  it('reconstructs a hole at its true station height', () => {
    // Review repro: stations 0 / 1 / 100 with heights 0 / ? / 100. The true
    // linear height at s = 1 is 1 m; index interpolation reported 50 m and
    // dragged the whole fitted profile with it.
    const { road, at } = exportedProfile(straightLane([0, 1, 100], [0, undefined, 100]))
    expect(road.hasElevation).toBe(true)
    expect(Math.abs(at(0.01) - 1)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(at(0) - 0)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(at(1) - 100)).toBeLessThanOrEqual(0.1)
  })

  it('does not bridge a stretch whose stations are far from every datum', () => {
    // 100 m road annotated only at its two ends: the four vertices in
    // between are 20..40 m from the nearest known height, so nothing in the
    // input describes the middle of the road.
    const { xml, road } = exportedProfile(
      straightLane([0, 20, 40, 60, 80, 100], [0, undefined, undefined, undefined, undefined, 100])
    )
    expect(road.hasElevation).toBe(false)
    expect(xml).toContain('<elevationProfile/>')
  })

  it('does not bridge a long run of unannotated vertices', () => {
    // Densely sampled road (2 m spacing) whose middle lost four vertices in
    // a row: within the distance budget, but more detail than a weld or a
    // shared point can explain.
    const { xml, road } = exportedProfile(
      straightLane([0, 2, 4, 6, 8, 10], [0, undefined, undefined, undefined, undefined, 10])
    )
    expect(road.hasElevation).toBe(false)
    expect(xml).toContain('<elevationProfile/>')
  })

  it('still reproduces a fully annotated grade exactly', () => {
    const { road, at } = exportedProfile(straightLane([0, 20, 40, 100], [0, 10, 20, 50]))
    expect(road.hasElevation).toBe(true)
    for (const [f, z] of [[0, 0], [0.2, 10], [0.4, 20], [1, 50]] as const) {
      expect(Math.abs(at(f) - z)).toBeLessThanOrEqual(0.1)
    }
  })
})
