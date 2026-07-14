// Unit tests for the plan-view geometry fitter: primitive classification
// (line / arc / paramPoly3), round-trip deviation against the input samples,
// C1 continuity between consecutive primitives, and station bookkeeping.

import { describe, it, expect } from 'vitest'
import { fitPlanView, type FitPoint } from '../../src/exporter/odrGeometryFit'
import { evalGeometry } from '../../src/exporter/odrGeometry'
import type { OdrGeometry } from '../../src/exporter/opendriveParser'

const POS_TOL = 0.05

/** Max distance from p to the polyline pts. */
function distToPolyline(p: { x: number; y: number }, pts: readonly FitPoint[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/** Evaluate every fitted geometry densely and return the inertial points. */
function evalDense(geometries: readonly OdrGeometry[], step: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const g of geometries) {
    const n = Math.max(2, Math.ceil(g.length / step))
    for (let k = 0; k <= n; k++) {
      const p = evalGeometry(g, (g.length * k) / n)
      out.push({ x: p.x, y: p.y })
    }
  }
  return out
}

/** Max deviation of the fitted curve from the input polyline (both ways). */
function maxDeviation(geometries: readonly OdrGeometry[], pts: readonly FitPoint[]): number {
  let max = 0
  for (const p of evalDense(geometries, 0.25)) max = Math.max(max, distToPolyline(p, pts))
  const curve = evalDense(geometries, 0.25)
  for (const p of pts) max = Math.max(max, distToPolyline(p, curve))
  return max
}

/** Assert exact C1 chaining: each primitive starts at its predecessor's end pose. */
function expectC1(geometries: readonly OdrGeometry[]): void {
  for (let i = 0; i < geometries.length - 1; i++) {
    const end = evalGeometry(geometries[i], geometries[i].length)
    const next = geometries[i + 1]
    expect(Math.hypot(end.x - next.x, end.y - next.y)).toBeLessThan(1e-9)
    expect(Math.abs(end.hdg - next.hdg)).toBeLessThan(1e-9)
  }
}

function arcPoints(radius: number, sweepRad: number, stepRad: number): FitPoint[] {
  // Circle centered at (0, radius), starting at origin heading +x (left turn).
  const pts: FitPoint[] = []
  for (let a = 0; a <= sweepRad + 1e-12; a += stepRad) {
    pts.push({ x: radius * Math.sin(a), y: radius * (1 - Math.cos(a)) })
  }
  return pts
}

/** Euler spiral samples by numeric integration: heading = 0.5*cDot*s^2. */
function clothoidPoints(cDot: number, length: number, step: number): FitPoint[] {
  const pts: FitPoint[] = [{ x: 0, y: 0 }]
  let x = 0
  let y = 0
  const micro = 0.01
  let emittedAt = 0
  for (let s = micro; s <= length + 1e-9; s += micro) {
    const theta = 0.5 * cDot * (s - micro / 2) ** 2
    x += micro * Math.cos(theta)
    y += micro * Math.sin(theta)
    if (s - emittedAt >= step - 1e-9) {
      pts.push({ x, y })
      emittedAt = s
    }
  }
  return pts
}

describe('fitPlanView', () => {
  it('fits a straight polyline as exactly one line', () => {
    const pts: FitPoint[] = []
    for (let i = 0; i <= 10; i++) pts.push({ x: i * 10, y: 5 + i * 2 })
    const fit = fitPlanView(pts)
    expect(fit.geometries).toHaveLength(1)
    expect(fit.geometries[0].kind).toBe('line')
    expect(fit.length).toBeCloseTo(Math.hypot(100, 20), 6)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
  })

  it('fits circular samples as a single arc with the true curvature', () => {
    const pts = arcPoints(40, Math.PI * 0.66, Math.PI / 90) // 2 deg steps
    const fit = fitPlanView(pts)
    expect(fit.geometries).toHaveLength(1)
    const g = fit.geometries[0]
    expect(g.kind).toBe('arc')
    if (g.kind === 'arc') expect(Math.abs(g.curvature - 1 / 40)).toBeLessThan(1e-4)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
  })

  it('keeps a noisy straight polyline a single line within tolerance', () => {
    // Deterministic pseudo-noise well inside the position tolerance.
    const pts: FitPoint[] = []
    for (let i = 0; i <= 40; i++) {
      pts.push({ x: i * 2.5, y: 0.02 * Math.sin(i * 1.7) })
    }
    const fit = fitPlanView(pts)
    expect(fit.geometries).toHaveLength(1)
    expect(fit.geometries[0].kind).toBe('line')
  })

  it('fits a clothoid within tolerance using few primitives, C1-chained', () => {
    // 120 m Euler spiral from straight to R = 1/(0.005*120) ~ 1.7e2..R=83m end.
    const pts = clothoidPoints(0.0001, 120, 2)
    const fit = fitPlanView(pts)
    expect(fit.geometries.length).toBeLessThan(12)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL + 0.01)
    expectC1(fit.geometries)
    // A clothoid is neither straight nor constant-curvature over its whole
    // span, so the fit must use at least one curved primitive.
    expect(fit.geometries.some(g => g.kind === 'arc' || g.kind === 'paramPoly3')).toBe(true)
  })

  it('classifies a line->arc compound correctly and stays C1', () => {
    const straight: FitPoint[] = []
    for (let i = 0; i <= 10; i++) straight.push({ x: i * 5, y: 0 })
    const bend = arcPoints(30, Math.PI / 2, Math.PI / 60).map(p => ({ x: p.x + 50, y: p.y }))
    const pts = [...straight, ...bend.slice(1)]
    const fit = fitPlanView(pts)
    expect(fit.geometries.length).toBeLessThanOrEqual(3)
    expect(fit.geometries[0].kind).toBe('line')
    expect(fit.geometries.some(g => g.kind === 'arc')).toBe(true)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
    expectC1(fit.geometries)
  })

  it('survives a sharp corner by degrading to chord lines', () => {
    const pts: FitPoint[] = []
    for (let i = 0; i <= 10; i++) pts.push({ x: i * 5, y: 0 })
    for (let i = 1; i <= 10; i++) pts.push({ x: 50, y: i * 5 })
    const fit = fitPlanView(pts)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
    // Two straight legs; the corner itself may add a short chord.
    expect(fit.geometries.length).toBeLessThanOrEqual(3)
    for (const g of fit.geometries) expect(g.kind).toBe('line')
  })

  it('merges sub-tolerance jogs instead of fitting them', () => {
    // A 5 mm sideways jog at the start (snap/weld artifact) must not produce
    // a degenerate primitive or corrupt the start heading.
    const pts: FitPoint[] = [{ x: 0, y: 0 }, { x: 0.003, y: 0.004 }]
    for (let i = 1; i <= 10; i++) pts.push({ x: i * 5, y: 0 })
    const fit = fitPlanView(pts)
    expect(fit.geometries).toHaveLength(1)
    expect(fit.geometries[0].kind).toBe('line')
    expect(Math.abs(fit.geometries[0].hdg)).toBeLessThan(0.01)
  })

  it('returns monotonic stations covering every input sample', () => {
    const pts = arcPoints(25, Math.PI / 2, Math.PI / 36)
    const fit = fitPlanView(pts)
    expect(fit.samplePoses).toHaveLength(pts.length)
    expect(fit.samplePoses[0].s).toBe(0)
    for (let i = 1; i < fit.samplePoses.length; i++) {
      expect(fit.samplePoses[i].s).toBeGreaterThanOrEqual(fit.samplePoses[i - 1].s)
    }
    const last = fit.samplePoses[fit.samplePoses.length - 1]
    expect(last.s).toBeCloseTo(fit.length, 9)
    // Poses lie on the fitted curve, near their input samples.
    for (let i = 0; i < pts.length; i++) {
      const p = fit.samplePoses[i]
      expect(Math.hypot(p.x - pts[i].x, p.y - pts[i].y)).toBeLessThanOrEqual(POS_TOL + 0.02)
    }
  })

  it('keeps every non-corner primitive boundary heading-continuous', () => {
    // A straight run followed by a gentle curve, sampled coarsely enough that
    // the single-step primitive candidates reject on tolerance and the fit
    // falls through to the degrade path. None of the transition vertices turn
    // past the corner threshold, so no primitive boundary may inject a heading
    // discontinuity: a raw chord <line> at each such vertex would connect two
    // straights at a spurious road angle (physically a car snaps its heading at
    // that station). Every adjacent-primitive joint must stay C1.
    const pts: FitPoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 42, y: 0 },
    ]
    let x = 42
    let y = 0
    const angleDeg = [6.55, 20, 30, 34, 36.4]
    const legLen = [3.66, 6.78, 4, 4, 3]
    for (let k = 0; k < legLen.length; k++) {
      const h = (angleDeg[k] * Math.PI) / 180
      x += Math.cos(h) * legLen[k]
      y += Math.sin(h) * legLen[k]
      pts.push({ x, y })
    }
    const fit = fitPlanView(pts)
    // No vertex deflects past the corner threshold, so no legitimate corner
    // break exists: every boundary heading difference must be ~0.
    for (let i = 0; i < fit.geometries.length - 1; i++) {
      const end = evalGeometry(fit.geometries[i], fit.geometries[i].length)
      const next = fit.geometries[i + 1]
      expect(Math.abs(end.hdg - next.hdg)).toBeLessThan(0.01)
    }
    expectC1(fit.geometries)
    // Deviation is looser here only because the reproduction is deliberately
    // coarse (metre-scale chords) to force the degrade path; the arc through
    // each pair of endpoints bulges off the straight chord by its sagitta. The
    // fit still tracks the polyline to well under a quarter metre.
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(0.25)
  })

  it('handles degenerate inputs without geometries', () => {
    expect(fitPlanView([]).geometries).toHaveLength(0)
    expect(fitPlanView([{ x: 1, y: 2 }]).geometries).toHaveLength(0)
    const dup = fitPlanView([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ])
    expect(dup.geometries).toHaveLength(0)
    expect(dup.samplePoses).toHaveLength(2)
  })
})
