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

/**
 * Assert G0 chaining: each primitive starts exactly where its predecessor
 * ended. Position continuity is unconditional — the reference line may never
 * tear — while heading may legally break at a polyline vertex.
 */
function expectC1Positions(geometries: readonly OdrGeometry[]): void {
  for (let i = 0; i < geometries.length - 1; i++) {
    const end = evalGeometry(geometries[i], geometries[i].length)
    const next = geometries[i + 1]
    expect(Math.hypot(end.x - next.x, end.y - next.y)).toBeLessThan(1e-9)
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

  it('keeps every boundary heading-continuous when the samples are dense', () => {
    // A straight run into a gentle curve, sampled densely enough that reading
    // the vertices as curve samples costs nothing: every sagitta stays under
    // the position tolerance, so no vertex is a polyline vertex and no
    // boundary may inject a heading discontinuity. A raw chord <line> at such
    // a vertex would connect two straights at a spurious road angle
    // (physically a car snaps its heading at that station).
    const pts: FitPoint[] = []
    for (let i = 0; i <= 20; i++) pts.push({ x: i * 2, y: 0 })
    // Arc of R = 60 m sampled every 1.5 m: sagitta 1.5^2/(8*60) = 4.7 mm.
    const R = 60
    for (let s = 1.5; s <= 45; s += 1.5) {
      const a = s / R
      pts.push({ x: 40 + R * Math.sin(a), y: R * (1 - Math.cos(a)) })
    }
    const fit = fitPlanView(pts)
    for (let i = 0; i < fit.geometries.length - 1; i++) {
      const end = evalGeometry(fit.geometries[i], fit.geometries[i].length)
      const next = fit.geometries[i + 1]
      expect(Math.abs(end.hdg - next.hdg)).toBeLessThan(0.01)
    }
    expectC1(fit.geometries)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
  })

  it('breaks heading at a sparse vertex instead of bulging off the chords', () => {
    // The same shape traced coarsely (metre-scale chords). Reading these
    // vertices as curve samples would swing the geometry off the drawn chords
    // by more than the position tolerance, so the fit must take them as
    // polyline vertices: heading breaks are allowed at the vertices, but the
    // curve may never wander from what was drawn.
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
    // Honesty is the binding constraint: the old G1-at-all-costs fit bulged
    // 0.25 m off the chords here.
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(0.12)
    expectC1Positions(fit.geometries)
  })

  it('tracks a coarse hand-drawn bend without leaving the drawn chords (real trace)', () => {
    // Real hand-drawn trace (canvas px at 16.67 px/m, y-down -> ENU y-up): a
    // long straight into a bend captured with only six vertices. The bend
    // vertices deflect up to ~22 deg over chords of a few metres, so a curve
    // drawn through them departs from the drawn chords by up to 0.26 m — five
    // times the position tolerance. They are polyline vertices: the fit
    // follows what was drawn and lets the heading break at the vertices.
    const px: [number, number][] = [
      [500, 618.68],
      [1201.1, 618.72],
      [1261.74, 611.76],
      [1365.74, 570.84],
      [1430.18, 509.62],
      [1484.17, 423.24],
    ]
    const pts: FitPoint[] = px.map(([x, y]) => ({ x: x / 16.67, y: -y / 16.67 }))
    const fit = fitPlanView(pts)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(0.11)
    expectC1Positions(fit.geometries)
    // Every drawn vertex lies on the fitted reference line.
    for (const p of pts) {
      expect(distToPolyline(p, evalDense(fit.geometries, 0.05))).toBeLessThan(1e-3)
    }
  })

  it('tracks a coarse straight-to-bend transition (synthetic)', () => {
    // Straight run into a coarsely sampled bend whose middle vertices deflect
    // 21.6 / 19.3 deg over metre-scale chords: reading them as curve samples
    // would swing the geometry 0.17 / 0.33 m off the drawing, so they are
    // polyline vertices.
    const pts: FitPoint[] = [
      [0, 0],
      [14, 0],
      [28, 0],
      [42, 0],
      [45.6, 0.4],
      [52, 3.8],
      [58, 9],
      [62, 16],
    ].map(([x, y]) => ({ x, y }))
    const fit = fitPlanView(pts)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(0.11)
    expectC1Positions(fit.geometries)
    for (const p of pts) {
      expect(distToPolyline(p, evalDense(fit.geometries, 0.05))).toBeLessThan(1e-3)
    }
  })

  it('still degrades a genuinely tight fold to chord lines', () => {
    // A right-angle fold drawn with 2.5 m chords: deflection 90 deg with
    // implied radius 2.5/(2 sin 45) ~ 1.8 m — tighter than any drivable road
    // fold, i.e. a real corner. The heading break must stay confined to the
    // corner chord lines; the two straight legs remain lines.
    const pts: FitPoint[] = []
    for (let i = 0; i <= 8; i++) pts.push({ x: i * 2.5, y: 0 })
    for (let i = 1; i <= 8; i++) pts.push({ x: 20, y: i * 2.5 })
    const fit = fitPlanView(pts)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
    for (const g of fit.geometries) expect(g.kind).toBe('line')
    expect(fit.geometries.length).toBeLessThanOrEqual(3)
  })

  // The same seven vertices are read two ways below: as drawn (sparse, spans
  // 17-37 m) they are a polyline; densified along a smooth curve they are
  // curve samples. Nothing but the spacing distinguishes them, which is
  // exactly what the sagitta rule measures.
  const SEVEN_VERTEX_BOUNDARY: FitPoint[] = [
    [-3.499416, 580.440876],
    [24.82792, 604.24312],
    [39.464213, 612.032581],
    [58.29425, 615.448512],
    [76.186171, 614.639438],
    [95.918704, 608.797543],
    [1994.0389730778652 / 16.67, 9825.840205448205 / 16.67],
  ].map(([x, y]) => ({ x, y }))

  it('exports a sparse hand-drawn polyline as the chords that were drawn', () => {
    // Real user boundary: seven vertices, 17-37 m apart, implied radii 52-80 m.
    // Every interior vertex has a sagitta of 0.43-1.02 m, so reading them as
    // curve samples would move the road up to 1.8 m off the drawing (measured
    // on the G1-at-all-costs fit this rule replaced).
    const fit = fitPlanView(SEVEN_VERTEX_BOUNDARY)
    for (const g of fit.geometries) expect(g.kind).toBe('line')
    expect(fit.geometries).toHaveLength(SEVEN_VERTEX_BOUNDARY.length - 1)
    // No bulge anywhere: the fit IS the chord polyline.
    expect(maxDeviation(fit.geometries, SEVEN_VERTEX_BOUNDARY)).toBeLessThanOrEqual(1e-6)
    // Vertices sit on the reference line, and so do the chord midpoints.
    const dense = evalDense(fit.geometries, 0.05)
    for (let i = 0; i < SEVEN_VERTEX_BOUNDARY.length; i++) {
      expect(distToPolyline(SEVEN_VERTEX_BOUNDARY[i], dense)).toBeLessThanOrEqual(1e-6)
      if (i === 0) continue
      const a = SEVEN_VERTEX_BOUNDARY[i - 1]
      const b = SEVEN_VERTEX_BOUNDARY[i]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      expect(distToPolyline(mid, dense)).toBeLessThanOrEqual(1e-6)
    }
    // Total length is the chord sum, not a longer curved path.
    let chordSum = 0
    for (let i = 1; i < SEVEN_VERTEX_BOUNDARY.length; i++) {
      chordSum += Math.hypot(
        SEVEN_VERTEX_BOUNDARY[i].x - SEVEN_VERTEX_BOUNDARY[i - 1].x,
        SEVEN_VERTEX_BOUNDARY[i].y - SEVEN_VERTEX_BOUNDARY[i - 1].y
      )
    }
    expect(fit.length).toBeCloseTo(chordSum, 6)
    expectC1Positions(fit.geometries)
  })

  it('fits the same shape as curves once it is densely sampled', () => {
    // The seven vertices densified along a circular arc every 3 m: sagitta
    // 3^2/(8*70) ~ 16 mm, well inside the tolerance, so these are curve
    // samples and the fit must stay curved and G1 — no chord shattering.
    const R = 70
    const pts: FitPoint[] = []
    for (let s = 0; s <= 140; s += 3) {
      const a = s / R
      pts.push({ x: R * Math.sin(a), y: 580 + R * (1 - Math.cos(a)) })
    }
    const fit = fitPlanView(pts)
    expect(fit.geometries.some(g => g.kind === 'arc' || g.kind === 'paramPoly3')).toBe(true)
    for (const g of fit.geometries) expect(g.kind).not.toBe('line')
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
    expectC1(fit.geometries)
  })

  it('leaves densely sampled input G1-chained regardless of total deflection', () => {
    // Dense sampling is the regime every imported OpenDRIVE map arrives in
    // (sampleReferenceLine bounds the chord error at 0.05 m) and the regime a
    // spline feeds the exporter. A full 180 deg of turning at 10 samples per
    // 90 deg-arc span must still fit as curves with no heading break.
    for (const step of [1, 2, 3]) {
      const R = 40
      const pts: FitPoint[] = []
      for (let s = 0; s <= R * Math.PI; s += step) {
        const a = s / R
        pts.push({ x: R * Math.sin(a), y: R * (1 - Math.cos(a)) })
      }
      const fit = fitPlanView(pts)
      for (const g of fit.geometries) expect(g.kind).not.toBe('line')
      expectC1(fit.geometries)
      expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
    }
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
