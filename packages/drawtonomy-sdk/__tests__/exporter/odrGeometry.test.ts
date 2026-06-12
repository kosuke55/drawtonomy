import { describe, it, expect } from 'vitest'
import {
  evalGeometry,
  evalPoly3,
  fresnel,
  sampleReferenceLine,
} from '../../src/exporter/odrGeometry'
import type { OdrGeometry, OdrRoad } from '../../src/exporter/opendriveParser'

function road(planView: OdrGeometry[], length: number): OdrRoad {
  return {
    id: 'r',
    name: '',
    length,
    junction: '-1',
    planView,
    laneOffsets: [],
    laneSections: [{ s: 0, left: [], center: [], right: [] }],
    signals: [],
    objects: [],
    hasElevation: false,
    hasSuperelevation: false,
  }
}

describe('fresnel', () => {
  // Reference values from Abramowitz & Stegun, Table 7.7 (normalized
  // convention C(t) = ∫ cos(πu²/2) du).
  it('matches tabulated values in the series regime (|t| <= 1.5)', () => {
    expect(fresnel(0.5).C).toBeCloseTo(0.4923442259, 8)
    expect(fresnel(0.5).S).toBeCloseTo(0.0647324329, 8)
    expect(fresnel(1.0).C).toBeCloseTo(0.7798934004, 8)
    expect(fresnel(1.0).S).toBeCloseTo(0.4382591474, 8)
  })

  it('matches tabulated values in the continued-fraction regime (|t| > 1.5)', () => {
    expect(fresnel(2.0).C).toBeCloseTo(0.4882534061, 8)
    expect(fresnel(2.0).S).toBeCloseTo(0.3434156784, 8)
    expect(fresnel(5.0).C).toBeCloseTo(0.5636311887, 8)
    expect(fresnel(5.0).S).toBeCloseTo(0.4991913819, 8)
  })

  it('is odd in its argument', () => {
    const pos = fresnel(1.25)
    const neg = fresnel(-1.25)
    expect(neg.C).toBeCloseTo(-pos.C, 12)
    expect(neg.S).toBeCloseTo(-pos.S, 12)
  })
})

describe('evalGeometry', () => {
  it('evaluates a line', () => {
    const g: OdrGeometry = { kind: 'line', s: 0, x: 1, y: 2, hdg: Math.PI / 2, length: 10 }
    const p = evalGeometry(g, 4)
    expect(p.x).toBeCloseTo(1, 10)
    expect(p.y).toBeCloseTo(6, 10)
    expect(p.hdg).toBeCloseTo(Math.PI / 2, 10)
  })

  it('evaluates a quarter circle arc against the closed form', () => {
    const R = 10
    const g: OdrGeometry = { kind: 'arc', s: 0, x: 0, y: 0, hdg: 0, length: (Math.PI * R) / 2, curvature: 1 / R }
    const p = evalGeometry(g, g.length)
    expect(p.x).toBeCloseTo(R, 9)
    expect(p.y).toBeCloseTo(R, 9)
    expect(p.hdg).toBeCloseTo(Math.PI / 2, 9)
  })

  it('evaluates a unit clothoid spiral against Fresnel values', () => {
    // cDot = π, length 1 → scale = 1, so the end point is (C(1), S(1)) and
    // the end heading is π·1²/2.
    const g: OdrGeometry = { kind: 'spiral', s: 0, x: 0, y: 0, hdg: 0, length: 1, curvStart: 0, curvEnd: Math.PI }
    const p = evalGeometry(g, 1)
    expect(p.x).toBeCloseTo(0.7798934004, 8)
    expect(p.y).toBeCloseTo(0.4382591474, 8)
    expect(p.hdg).toBeCloseTo(Math.PI / 2, 10)
  })

  it('a spiral split at an interior point is continuous (nonzero curvStart window)', () => {
    const full: OdrGeometry = { kind: 'spiral', s: 0, x: 0, y: 0, hdg: 0, length: 2, curvStart: 0, curvEnd: 0.5 }
    const mid = evalGeometry(full, 1.2)
    const kMid = 0 + ((0.5 - 0) / 2) * 1.2
    const tail: OdrGeometry = {
      kind: 'spiral',
      s: 0,
      x: mid.x,
      y: mid.y,
      hdg: mid.hdg,
      length: 0.8,
      curvStart: kMid,
      curvEnd: 0.5,
    }
    const viaTail = evalGeometry(tail, 0.8)
    const direct = evalGeometry(full, 2)
    expect(viaTail.x).toBeCloseTo(direct.x, 8)
    expect(viaTail.y).toBeCloseTo(direct.y, 8)
    expect(viaTail.hdg).toBeCloseTo(direct.hdg, 8)
  })

  it('handles a negative-rate spiral (curvature decreasing)', () => {
    const g: OdrGeometry = { kind: 'spiral', s: 0, x: 0, y: 0, hdg: 0, length: 1, curvStart: 0, curvEnd: -Math.PI }
    const p = evalGeometry(g, 1)
    expect(p.x).toBeCloseTo(0.7798934004, 8)
    expect(p.y).toBeCloseTo(-0.4382591474, 8)
    expect(p.hdg).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('evaluates paramPoly3 in normalized and arcLength pRange modes', () => {
    const base = { s: 0, x: 5, y: 0, hdg: 0, length: 10, aU: 0, bU: 10, cU: 0, dU: 0, aV: 0, bV: 0, cV: 1, dV: 0 }
    const norm: OdrGeometry = { kind: 'paramPoly3', ...base, pRange: 'normalized' }
    const pNorm = evalGeometry(norm, 10) // p = 1
    expect(pNorm.x).toBeCloseTo(15, 10)
    expect(pNorm.y).toBeCloseTo(1, 10)
    expect(pNorm.hdg).toBeCloseTo(Math.atan2(2, 10), 10)

    const arc: OdrGeometry = { kind: 'paramPoly3', ...base, bU: 1, cV: 0.01, pRange: 'arcLength' }
    const pArc = evalGeometry(arc, 10) // p = 10
    expect(pArc.x).toBeCloseTo(15, 10)
    expect(pArc.y).toBeCloseTo(1, 10)
  })

  it('rotates paramPoly3 local coordinates by the start heading', () => {
    const g: OdrGeometry = {
      kind: 'paramPoly3',
      s: 0,
      x: 0,
      y: 0,
      hdg: Math.PI / 2,
      length: 10,
      aU: 0,
      bU: 10,
      cU: 0,
      dU: 0,
      aV: 0,
      bV: 0,
      cV: 0,
      dV: 0,
      pRange: 'normalized',
    }
    const p = evalGeometry(g, 10)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(10, 9)
  })
})

describe('evalPoly3', () => {
  it('evaluates a cubic record', () => {
    expect(evalPoly3({ a: 1, b: 2, c: 3, d: 4 }, 2)).toBeCloseTo(1 + 4 + 12 + 32, 12)
  })
})

describe('sampleReferenceLine', () => {
  it('returns endpoints and respects the chord error bound on a tight arc', () => {
    const R = 10
    const len = (Math.PI * R) / 2
    const r = road([{ kind: 'arc', s: 0, x: 0, y: 0, hdg: 0, length: len, curvature: 1 / R }], len)
    const tol = 0.05
    const samples = sampleReferenceLine(r, { maxChordErrorMeters: tol })
    expect(samples[0].s).toBe(0)
    expect(samples[samples.length - 1].s).toBeCloseTo(len, 9)
    // Verify the bound: the midpoint of every step deviates from the chord by
    // at most tol (sagitta check via the evaluated geometry).
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]
      const b = samples[i + 1]
      const mid = evalGeometry(r.planView[0], (a.s + b.s) / 2)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lenSeg = Math.hypot(dx, dy)
      const dev = Math.abs((mid.x - a.x) * dy - (mid.y - a.y) * dx) / lenSeg
      expect(dev).toBeLessThanOrEqual(tol * 1.0001)
    }
  })

  it('keeps a straight road sparse while honoring the max step', () => {
    const r = road([{ kind: 'line', s: 0, x: 0, y: 0, hdg: 0, length: 100 }], 100)
    const samples = sampleReferenceLine(r, { maxStepMeters: 10 })
    // Bisection subdivides in powers of two: 100 m -> 6.25 m steps -> 17 stations.
    expect(samples).toHaveLength(17)
    for (let i = 0; i < samples.length - 1; i++) {
      expect(samples[i + 1].s - samples[i].s).toBeLessThanOrEqual(10)
    }
  })

  it('includes geometry boundaries and extra stations', () => {
    const r = road(
      [
        { kind: 'line', s: 0, x: 0, y: 0, hdg: 0, length: 30 },
        { kind: 'line', s: 30, x: 30, y: 0, hdg: 0, length: 70 },
      ],
      100
    )
    const samples = sampleReferenceLine(r, { extraStations: [42.5] })
    const stations = samples.map(s => s.s)
    expect(stations).toContain(30)
    expect(stations).toContain(42.5)
  })
})
