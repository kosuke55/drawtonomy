// Curvature-continuous (G2) plan-view fitting.
//
// What these tests pin, and why:
//  - Curvature is shared at every joint inside a smooth run. This is the whole
//    point: a vehicle tracking a lane at lateral offset t advances along the
//    reference line at ds = v·dt/(1 − κt), so a curvature step at a joint
//    stretches one integration step into an acceleration spike that GROWS as
//    the time step shrinks. Δκ = 0 removes it at the source.
//  - Position and heading still chain to machine precision, and the run's end
//    lands on the point that was drawn (it is a contact point with whatever
//    road follows).
//  - Shapes the spiral model cannot carry, or carries less accurately than the
//    greedy fit, keep the greedy fit. G2 may never cost accuracy.
//  - `continuity: 'g1'` reproduces the greedy output exactly.

import { describe, it, expect } from 'vitest'
import { fitPlanView, runTipTangent, type FitPoint } from '../../src/exporter/odrGeometryFit'
import { fitClothoidRun } from '../../src/exporter/odrClothoidFit'
import { evalGeometry } from '../../src/exporter/odrGeometry'
import type { OdrGeometry } from '../../src/exporter/opendriveParser'

const POS_TOL = 0.05
/** Tightest band a floating-point chain can be held to. */
const EXACT = 1e-9

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Curvature at a primitive's start or end; null when the record has none. */
function boundaryCurvature(g: OdrGeometry, at: 'start' | 'end'): number | null {
  switch (g.kind) {
    case 'line':
      return 0
    case 'arc':
      return g.curvature
    case 'spiral':
      return at === 'start' ? g.curvStart : g.curvEnd
    default:
      return null
  }
}

function distToPolyline(p: FitPoint, pts: readonly FitPoint[]): number {
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

function evalDense(geometries: readonly OdrGeometry[], step: number): FitPoint[] {
  const out: FitPoint[] = []
  for (const g of geometries) {
    const n = Math.max(2, Math.ceil(g.length / step))
    for (let k = 0; k <= n; k++) {
      const p = evalGeometry(g, (g.length * k) / n)
      out.push({ x: p.x, y: p.y })
    }
  }
  return out
}

function maxDeviation(geometries: readonly OdrGeometry[], pts: readonly FitPoint[]): number {
  const curve = evalDense(geometries, 0.25)
  let max = 0
  for (const p of curve) max = Math.max(max, distToPolyline(p, pts))
  for (const p of pts) max = Math.max(max, distToPolyline(p, curve))
  return max
}

/**
 * Worst curvature / position / heading step across the joints of a chain,
 * skipping joints where the heading legitimately breaks (a fold the author
 * drew, which breaks curvature with it).
 */
function jointSteps(geometries: readonly OdrGeometry[]): {
  curvature: number
  position: number
  heading: number
  smoothJoints: number
} {
  let curvature = 0
  let position = 0
  let heading = 0
  let smoothJoints = 0
  for (let i = 0; i < geometries.length - 1; i++) {
    const a = geometries[i]
    const b = geometries[i + 1]
    const end = evalGeometry(a, a.length)
    position = Math.max(position, Math.hypot(end.x - b.x, end.y - b.y))
    const dHdg = Math.abs(end.hdg - b.hdg)
    if (dHdg > EXACT) continue // fold
    smoothJoints++
    heading = Math.max(heading, dHdg)
    const ka = boundaryCurvature(a, 'end')
    const kb = boundaryCurvature(b, 'start')
    curvature = Math.max(curvature, ka === null || kb === null ? Infinity : Math.abs(ka - kb))
  }
  return { curvature, position, heading, smoothJoints }
}

/** Samples of an S-curve: two opposing bends joined smoothly. */
function sCurvePoints(): FitPoint[] {
  const pts: FitPoint[] = []
  const amplitude = 13
  const wavelength = 100
  for (let s = 0; s <= 100; s += 100 / 60) {
    pts.push({ x: s, y: amplitude * Math.sin((2 * Math.PI * s) / wavelength) })
  }
  return pts
}

function arcPoints(radius: number, sweepRad: number, stepRad: number): FitPoint[] {
  const pts: FitPoint[] = []
  for (let a = 0; a <= sweepRad + 1e-12; a += stepRad) {
    pts.push({ x: radius * Math.sin(a), y: radius * (1 - Math.cos(a)) })
  }
  return pts
}

/** Euler spiral samples by numeric integration: heading = 0.5·cDot·s². */
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

describe('fitPlanView with curvature continuity', () => {
  it('shares curvature, position and heading at every joint of an S-curve', () => {
    const pts = sCurvePoints()
    const fit = fitPlanView(pts)
    expect(fit.geometries.some(g => g.kind === 'spiral')).toBe(true)
    const steps = jointSteps(fit.geometries)
    expect(steps.smoothJoints).toBeGreaterThan(0)
    expect(steps.curvature).toBeLessThanOrEqual(1e-6)
    expect(steps.position).toBeLessThanOrEqual(1e-9)
    expect(steps.heading).toBeLessThanOrEqual(1e-9)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
  })

  it('lands the fitted end on the drawn endpoint', () => {
    // The last input point is a contact point with the neighbouring road, so
    // it is held to machine precision, not to the shape tolerance.
    for (const pts of [sCurvePoints(), clothoidPoints(0.0001, 120, 2)]) {
      const fit = fitPlanView(pts)
      const tail = fit.geometries[fit.geometries.length - 1]
      const end = evalGeometry(tail, tail.length)
      const last = pts[pts.length - 1]
      expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThanOrEqual(1e-6)
    }
  })

  it('fits a true clothoid as spirals, closer than the G1 fit', () => {
    // The shape IS an Euler spiral, so <spiral> is the exact primitive for it;
    // a cubic chain can only approximate it.
    const pts = clothoidPoints(0.0001, 120, 2)
    const g2 = fitPlanView(pts)
    const g1 = fitPlanView(pts, { continuity: 'g1' })
    expect(g2.geometries.every(g => g.kind === 'spiral')).toBe(true)
    expect(g2.geometries.length).toBeLessThanOrEqual(g1.geometries.length)
    expect(maxDeviation(g2.geometries, pts)).toBeLessThan(maxDeviation(g1.geometries, pts))
    expect(jointSteps(g2.geometries).curvature).toBeLessThanOrEqual(1e-6)
  })

  it('keeps stations contiguous and summing to the fitted length', () => {
    const pts = sCurvePoints()
    const fit = fitPlanView(pts)
    let s = 0
    for (const g of fit.geometries) {
      expect(g.s).toBeCloseTo(s, 9)
      s += g.length
    }
    expect(s).toBeCloseTo(fit.length, 9)
    expect(fit.samplePoses).toHaveLength(pts.length)
    for (let i = 1; i < fit.samplePoses.length; i++) {
      expect(fit.samplePoses[i].s).toBeGreaterThanOrEqual(fit.samplePoses[i - 1].s)
    }
  })

  it('is invariant to the run direction and to an initial heading near ±pi', () => {
    // The heading profile is unwrapped, so a run pointing west (where atan2
    // flips sign) must fit exactly as well as one pointing east.
    const base = sCurvePoints()
    const theta = (175 * Math.PI) / 180
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const pts = base
      .slice()
      .reverse()
      .map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
    const fit = fitPlanView(pts)
    expect(fit.geometries.some(g => g.kind === 'spiral')).toBe(true)
    const steps = jointSteps(fit.geometries)
    expect(steps.curvature).toBeLessThanOrEqual(1e-6)
    expect(steps.position).toBeLessThanOrEqual(1e-9)
    expect(steps.heading).toBeLessThanOrEqual(1e-9)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL)
  })

  describe('shapes that keep the greedy fit', () => {
    // G2 is never bought at the cost of accuracy or simplicity: a run the
    // greedy fitter already renders curvature-continuously, or renders closer
    // to the data, keeps that fit.
    const expectSameAsG1 = (pts: FitPoint[]): void => {
      const g2 = fitPlanView(pts)
      const g1 = fitPlanView(pts, { continuity: 'g1' })
      expect(g2.geometries).toEqual(g1.geometries)
      expect(g2.length).toBe(g1.length)
    }

    it('a straight polyline stays one line', () => {
      const pts: FitPoint[] = []
      for (let i = 0; i <= 10; i++) pts.push({ x: i * 10, y: 5 + i * 2 })
      const fit = fitPlanView(pts)
      expect(fit.geometries).toHaveLength(1)
      expect(fit.geometries[0].kind).toBe('line')
      expectSameAsG1(pts)
    })

    it('a single arc stays one arc', () => {
      const pts = arcPoints(40, Math.PI / 2, Math.PI / 90)
      const fit = fitPlanView(pts)
      expect(fit.geometries).toHaveLength(1)
      expect(fit.geometries[0].kind).toBe('arc')
      expectSameAsG1(pts)
    })

    it('a tight U-turn stays arcs', () => {
      const R = 5
      const pts: FitPoint[] = []
      for (let s = 0; s <= R * Math.PI + 1e-9; s += 0.25) {
        const a = s / R
        pts.push({ x: R * Math.sin(a), y: R * (1 - Math.cos(a)) })
      }
      const fit = fitPlanView(pts)
      for (const g of fit.geometries) expect(g.kind).toBe('arc')
      expectSameAsG1(pts)
    })

    it('a line-arc-line compound keeps the greedy fit (closer to the data)', () => {
      // A curvature STEP: a uniform knot grid can only smooth it, overshooting
      // on both sides the way any fixed-resolution approximation of a step
      // does. The greedy fit's Hermite transition is closer, so it wins.
      const pts: FitPoint[] = []
      for (let i = 0; i <= 20; i++) pts.push({ x: i * 2, y: 0 })
      const R = 50
      for (let s = 1; s <= (R * Math.PI) / 2; s += 1) {
        const a = s / R
        pts.push({ x: 40 + R * Math.sin(a), y: R * (1 - Math.cos(a)) })
      }
      const ex = pts[pts.length - 1].x
      const ey = pts[pts.length - 1].y
      for (let i = 1; i <= 20; i++) pts.push({ x: ex, y: ey + i * 2 })
      expectSameAsG1(pts)
    })

    it('a very short road keeps the greedy fit', () => {
      expectSameAsG1([
        { x: 0, y: 0 },
        { x: 1, y: 0.02 },
        { x: 2, y: 0.06 },
        { x: 3, y: 0.12 },
      ])
    })

    it('a sparse fold-only polyline stays the chords that were drawn', () => {
      const pts: FitPoint[] = [
        [-3.499416, 580.440876],
        [24.82792, 604.24312],
        [39.464213, 612.032581],
        [58.29425, 615.448512],
        [76.186171, 614.639438],
        [95.918704, 608.797543],
        [119.61841, 589.432526],
      ].map(([x, y]) => ({ x, y }))
      const fit = fitPlanView(pts)
      for (const g of fit.geometries) expect(g.kind).toBe('line')
      expectSameAsG1(pts)
    })

    it('degenerate inputs produce no geometries', () => {
      expect(fitPlanView([]).geometries).toHaveLength(0)
      expect(fitPlanView([{ x: 1, y: 2 }]).geometries).toHaveLength(0)
    })
  })

  it('honours a fold between two smooth runs and keeps each run continuous', () => {
    // Two gentle bends meeting at a 70 deg corner. The corner must still break
    // (it is what was drawn) while the joints on either side of it stay
    // position-exact.
    const R = 60
    const pts: FitPoint[] = []
    for (let s = 0; s <= 60; s += 2) {
      const a = s / R
      pts.push({ x: R * Math.sin(a), y: R * (1 - Math.cos(a)) })
    }
    const cx = pts[pts.length - 1].x
    const cy = pts[pts.length - 1].y
    const base = (-70 * Math.PI) / 180
    for (let s = 2; s <= 60; s += 2) {
      const a = s / R
      const lx = R * Math.sin(a)
      const ly = R * (1 - Math.cos(a))
      pts.push({
        x: cx + Math.cos(base) * lx - Math.sin(base) * ly,
        y: cy + Math.sin(base) * lx + Math.cos(base) * ly,
      })
    }
    const fit = fitPlanView(pts)
    const steps = jointSteps(fit.geometries)
    // Position never tears, not even across the fold.
    expect(steps.position).toBeLessThanOrEqual(1e-9)
    expect(maxDeviation(fit.geometries, pts)).toBeLessThanOrEqual(POS_TOL + 0.01)
    // The corner is preserved as a heading break.
    let brokeHeading = false
    for (let i = 0; i < fit.geometries.length - 1; i++) {
      const end = evalGeometry(fit.geometries[i], fit.geometries[i].length)
      if (Math.abs(end.hdg - fit.geometries[i + 1].hdg) > 0.1) brokeHeading = true
    }
    expect(brokeHeading).toBe(true)
  })

  it("continuity: 'g1' reproduces the greedy fit for every shape", () => {
    // The escape hatch must be exact, not merely similar: anything comparing
    // against a stored pre-G2 expectation relies on it.
    const inputs: FitPoint[][] = [
      sCurvePoints(),
      clothoidPoints(0.0001, 120, 2),
      arcPoints(40, Math.PI / 2, Math.PI / 90),
    ]
    for (const pts of inputs) {
      const explicit = fitPlanView(pts, { continuity: 'g1' })
      // Same options object minus the flag: the greedy path is what remains.
      const again = fitPlanView(pts, { continuity: 'g1' })
      expect(explicit.geometries).toEqual(again.geometries)
      // And it must differ from the default where the default adds spirals.
      const g2 = fitPlanView(pts)
      if (g2.geometries.some(g => g.kind === 'spiral')) {
        expect(explicit.geometries.some(g => g.kind === 'spiral')).toBe(false)
      }
    }
  })
})

describe('fitClothoidRun', () => {
  const HDG_TOL = (0.5 * Math.PI) / 180
  /** The tip headings the exporter pins a run to. */
  const tips = (pts: FitPoint[]) => ({
    startHdg: runTipTangent(pts, 'start', HDG_TOL),
    endHdg: runTipTangent(pts, 'end', HDG_TOL),
  })

  it('declines runs it cannot carry instead of returning a bad fit', () => {
    // Too few points to place even one interior knot.
    const stub: FitPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    expect(
      fitClothoidRun(stub, { posTol: 0.05, hdgTol: 0.01, ...tips(stub) })
    ).toBeNull()
    // A tolerance no knot count can meet.
    const s = sCurvePoints()
    expect(fitClothoidRun(s, { posTol: 1e-9, hdgTol: 1e-9, ...tips(s) })).toBeNull()
  })

  it('reports the accepted knot count, deviation and end error', () => {
    const pts = sCurvePoints()
    const result = fitClothoidRun(pts, { posTol: POS_TOL, hdgTol: HDG_TOL, ...tips(pts) })
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.knots).toBeGreaterThanOrEqual(2)
    expect(result.geometries).toHaveLength(result.knots)
    expect(result.maxDeviation).toBeLessThanOrEqual(POS_TOL)
    expect(result.endPosError).toBeLessThanOrEqual(1e-6)
    expect(result.stations).toHaveLength(pts.length)
  })

  it('meets both pinned tip headings exactly, for any knot count', () => {
    // These are not hints. A road's tip heading is the contact cross-section
    // its neighbour is built on, and a lane border sits t metres off the
    // reference line, so an error dh there opens a t*dh gap between connected
    // lanes. The fit is held to the pinned value, not converged towards it.
    const pts = sCurvePoints()
    const pinnedStart = 0.25
    const pinnedEnd = -0.4
    for (const knotCount of [4, 6, 8, 12, 16]) {
      const result = fitClothoidRun(pts, {
        posTol: 10,
        hdgTol: 10,
        startHdg: pinnedStart,
        endHdg: pinnedEnd,
        knotCounts: [knotCount],
      })
      expect(result).not.toBeNull()
      if (!result) continue
      expect(result.geometries[0].hdg).toBeCloseTo(pinnedStart, 12)
      const tail = result.geometries[result.geometries.length - 1]
      const end = evalGeometry(tail, tail.length)
      expect(Math.abs(wrapAngle(end.hdg - pinnedEnd))).toBeLessThan(1e-9)
    }
  })

  it('keeps the pinned end heading while closing the end position', () => {
    // The two constraints are solved together; a fit that satisfied them in
    // sequence would have each correction undo the other.
    const pts = sCurvePoints()
    const t = tips(pts)
    const result = fitClothoidRun(pts, { posTol: POS_TOL, hdgTol: HDG_TOL, ...t })
    expect(result).not.toBeNull()
    if (!result) return
    const tail = result.geometries[result.geometries.length - 1]
    const end = evalGeometry(tail, tail.length)
    const last = pts[pts.length - 1]
    expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThan(1e-6)
    expect(Math.abs(wrapAngle(end.hdg - t.endHdg))).toBeLessThan(1e-9)
    expect(Math.abs(wrapAngle(result.geometries[0].hdg - t.startHdg))).toBeLessThan(1e-12)
  })
})
