// Curvature-continuous (G2) plan-view fitting for one smooth run of reference
// points.
//
// Why this exists
// ---------------
// A reference line assembled from cubic Hermite pieces (<paramPoly3>) shares
// position and tangent at every joint, but not curvature. A vehicle driving a
// lane at a lateral offset `t` from the reference line advances along it at
//   ds = v·dt / (1 − κ·t),
// so a curvature step Δκ at a joint stretches exactly one integration step by
//   Δa ≈ (v/dt)·|Δκ|·|t| / (1 − κt)²,
// which surfaces as a longitudinal acceleration spike that grows as the time
// step shrinks. It is an artifact of the joint, not of the road.
//
// The cure is to describe the reference line by a curvature function that is
// continuous by construction. A continuous piecewise-linear κ(s) does that:
// each piece has linearly varying curvature, i.e. an Euler spiral, which
// OpenDRIVE expresses directly as <spiral curvStart curvEnd>. Pieces whose two
// knot curvatures coincide collapse to <arc> (or <line> when both are zero).
// Neighbouring pieces share a knot value, so Δκ = 0 at every joint: G2.
//
// How the fit works
// -----------------
//  1. Sample a heading profile θ(s) from the input polyline (chord directions
//     assigned to chord arc-length midpoints — second-order accurate, exact on
//     a circle).
//  2. With κ piecewise linear on a knot grid, θ(s) = θ0 + ∫κ is LINEAR in the
//     knot values, so step 1 gives an ordinary least-squares problem. Solve it
//     for a starting guess.
//  3. Polish with Gauss-Newton on the true objective (distance from each input
//     point to the integrated curve) under a hard equality constraint on the
//     end position, solved as a KKT system. The constraint is what keeps the
//     run's end exactly on the point the caller drew, which is a contact point
//     with the neighbouring road.
//  4. Try knot counts from small to large and keep the first that meets the
//     position and heading tolerances. Report failure if none does, so the
//     caller can fall back rather than emit a bad road.
//
// No external dependencies.

import type { OdrGeometry } from './opendriveParser.js'
import { evalGeometry } from './odrGeometry.js'

export interface ClothoidFitPoint {
  x: number
  y: number
}

export interface ClothoidFitOptions {
  /** Maximum position deviation between samples and the fit (m). */
  posTol: number
  /** Maximum end-heading deviation (rad). */
  hdgTol: number
  /** Knot counts to try, in order. */
  knotCounts?: readonly number[]
  /** Heading the run must start with; omitted means "free" (use the data). */
  startHdg?: number
}

export interface ClothoidFitResult {
  geometries: OdrGeometry[]
  /** Station of every input point on the fitted curve. */
  stations: number[]
  /** Total fitted arc length (m). */
  length: number
  /** Worst distance between an input point and the fitted curve (m). */
  maxDeviation: number
  /** Distance from the fitted end to the last input point (m). */
  endPosError: number
  /** Knot count that was accepted. */
  knots: number
}

/** Knot counts tried, smallest first. */
const DEFAULT_KNOT_COUNTS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48] as const
/** Curvature below this is written as a straight <line>. */
const LINE_CURVATURE_EPS = 1e-9
/** Curvature difference below this is written as a constant-curvature <arc>. */
const ARC_CURVATURE_EPS = 1e-9
/** Integration substeps per spiral piece when measuring deviation. */
const SUBSTEPS_PER_PIECE = 24
/** Shortest run worth fitting (m). */
const MIN_RUN_LENGTH = 1e-6
/**
 * End-position offset treated as closed (m). A road endpoint is a contact
 * point with the neighbouring road, so it is held to machine precision rather
 * than to the (centimetre) shape tolerance.
 */
const END_CONSTRAINT_TOL = 1e-9
/**
 * Largest end-position offset a fit may be accepted with (m). One order above
 * the Newton target so a run whose constraint Jacobian is poorly conditioned
 * (a nearly straight run, where curvature barely moves the end sideways) is
 * not rejected over floating-point noise, while anything a downstream consumer
 * could notice still falls through to the fallback fitter.
 */
const END_CONSTRAINT_ACCEPT_TOL = 1e-6

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Cumulative chord length of a point list. */
function chordStations(pts: readonly ClothoidFitPoint[]): number[] {
  const s = [0]
  for (let i = 1; i < pts.length; i++) {
    s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return s
}

/** Distance from p to the polyline pts. */
function distToPolyline(p: ClothoidFitPoint, pts: readonly ClothoidFitPoint[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    if (t < 0) t = 0
    if (t > 1) t = 1
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < best) best = d
  }
  return best
}

/** Gaussian elimination with partial pivoting. Returns null when singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length
  const a = matrix.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-14) return null
    const tmp = a[col]
    a[col] = a[pivot]
    a[pivot] = tmp
    const d = a[col][col]
    for (let j = col; j <= n; j++) a[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = col; j <= n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map(row => row[n])
}

/**
 * Heading profile θ(s) sampled from the polyline.
 *
 * A chord's direction is the tangent at the chord's arc-length midpoint to
 * second order (exactly so on a circular arc), so each chord contributes one
 * (station, heading) pair at its midpoint. Headings are unwrapped so the
 * profile is continuous and the least-squares problem below stays linear.
 */
function headingProfile(pts: readonly ClothoidFitPoint[]): {
  s: number[]
  theta: number[]
  total: number
  /** Chord direction at s = startChordHalf, i.e. biased by that much turning. */
  startHdg: number
  startChordHalf: number
  /** Chord direction at s = L − endChordHalf. */
  endHdg: number
  endChordHalf: number
} {
  const st = chordStations(pts)
  const total = st[st.length - 1]
  const s: number[] = []
  const theta: number[] = []
  let prev = 0
  for (let i = 0; i < pts.length - 1; i++) {
    let a = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
    if (i === 0) prev = a
    a = prev + wrapAngle(a - prev)
    prev = a
    s.push((st[i] + st[i + 1]) / 2)
    theta.push(a)
  }
  // Endpoint tangents: a chord's direction is the tangent at its MIDPOINT, so
  // taking the first/last chord direction as the tangent at s = 0 / s = L is
  // biased by half a chord of turning — 0.7 deg on a 2 m chord at R = 80 m,
  // already past the default heading tolerance. The bias is κ·(chord/2) and
  // its correction is applied where κ is known: `fitClothoidRun` uses the
  // fit's own end knot curvature. Extrapolating θ(s) through the two nearest
  // chord samples would also remove it, but it doubles the noise in those two
  // samples, which on hand-drawn input is larger than the bias it removes.
  const n = theta.length
  return {
    s,
    theta,
    total,
    startHdg: theta[0],
    startChordHalf: s[0],
    endHdg: theta[n - 1],
    endChordHalf: total - s[n - 1],
  }
}

/**
 * Integral of the piecewise-linear hat basis functions from 0 to s.
 *
 * On the grid piece [i·seg, (i+1)·seg] the curvature is
 *   κ(s) = k_i·(1 − t) + k_{i+1}·t,  t = (s − i·seg)/seg,
 * so ∫₀ˢ κ is a linear combination of the knot values with these weights.
 */
function basisIntegral(s: number, knotCount: number, seg: number): number[] {
  const row = new Array(knotCount + 1).fill(0)
  for (let i = 0; i < knotCount; i++) {
    const a0 = i * seg
    if (s <= a0) break
    const hi = Math.min(s, a0 + seg)
    const t = (hi - a0) / seg
    row[i] += seg * (t - (t * t) / 2)
    row[i + 1] += seg * ((t * t) / 2)
  }
  return row
}

/**
 * Least-squares knot curvatures matching the sampled heading profile.
 *
 * θ(s) − θ0 is linear in the knot values, so this is a normal-equation solve.
 * A tiny second-difference penalty keeps the system well conditioned when the
 * grid is finer than the data supports.
 */
function fitKnotsToHeading(
  profile: { s: number[]; theta: number[]; total: number },
  knotCount: number,
  startHdg: number
): number[] | null {
  const seg = profile.total / knotCount
  const n = knotCount + 1
  const ata: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const atb = new Array(n).fill(0)
  for (let r = 0; r < profile.s.length; r++) {
    const row = basisIntegral(profile.s[r], knotCount, seg)
    const target = profile.theta[r] - startHdg
    for (let i = 0; i < n; i++) {
      if (row[i] === 0) continue
      atb[i] += row[i] * target
      for (let j = 0; j < n; j++) {
        if (row[j] !== 0) ata[i][j] += row[i] * row[j]
      }
    }
  }
  const lambda = 1e-6
  for (let i = 1; i < n - 1; i++) {
    const stencil = [1, -2, 1]
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        ata[i - 1 + a][i - 1 + b] += lambda * stencil[a] * stencil[b]
      }
    }
  }
  return solveLinear(ata, atb)
}

/**
 * Integrate a continuous piecewise-linear κ(s) from a start pose.
 *
 * Within a piece the heading is a quadratic in s (κ is linear), so the heading
 * at a substep midpoint is available in closed form; only the position needs
 * numeric integration.
 */
function integrateCurve(
  knots: readonly number[],
  length: number,
  x0: number,
  y0: number,
  h0: number,
  substeps: number
): { pts: ClothoidFitPoint[]; endX: number; endY: number; endHdg: number } {
  const pieces = knots.length - 1
  const seg = length / pieces
  const pts: ClothoidFitPoint[] = [{ x: x0, y: y0 }]
  let x = x0
  let y = y0
  let h = h0
  for (let i = 0; i < pieces; i++) {
    const kA = knots[i]
    const kB = knots[i + 1]
    const ds = seg / substeps
    for (let j = 0; j < substeps; j++) {
      const u0 = j / substeps
      const u1 = (j + 1) / substeps
      const ka = kA + (kB - kA) * u0
      const kb = kA + (kB - kA) * u1
      // Heading at the substep midpoint, exact for linear κ.
      const hMid = h + (ka * ds) / 2 + ((kb - ka) * ds) / 8
      x += ds * Math.cos(hMid)
      y += ds * Math.sin(hMid)
      h += ((ka + kb) / 2) * ds
      pts.push({ x, y })
    }
  }
  return { pts, endX: x, endY: y, endHdg: h }
}

/**
 * Worst distance from the input points to the fitted curve.
 *
 * Deliberately one-directional. The reverse measure (curve to input chords)
 * is not a fit error here: a curve through samples spaced a few metres apart
 * stands off their chords by the sagitta, which on a legitimately sampled road
 * is the same order as the tolerance itself — scoring it would reject every
 * correct fit on coarse input. Bulging BETWEEN samples is caught instead by
 * the arc-length check in `fitClothoidRun`, which a detour cannot pass.
 */
function maxDeviationOf(pts: readonly ClothoidFitPoint[], curve: readonly ClothoidFitPoint[]): number {
  let worst = 0
  for (const p of pts) worst = Math.max(worst, distToPolyline(p, curve))
  return worst
}

/**
 * Gauss-Newton polish of the knot curvatures under a hard end-position
 * constraint.
 *
 * Objective: the distance of every input point to the integrated curve.
 * Constraint: the integrated end lands exactly on the last input point.
 *
 * The constrained step comes from the KKT system
 *   [ JᵀJ + μI   Cᵀ ] [ Δk ] = [ −Jᵀr ]
 *   [ C          0  ] [ λ  ]   [ −c   ]
 * where C is the Jacobian of the two end-position components and c their
 * current residual. Because the constraint enters as an equality (not a
 * weighted term), the end error contracts quadratically instead of settling at
 * whatever the weighting trades it down to.
 */
function polishKnots(
  initial: readonly number[],
  length: number,
  pts: readonly ClothoidFitPoint[],
  x0: number,
  y0: number,
  h0: number,
  iterations: number,
  /** Sample residual at or below which the shape needs no further work. */
  shapeTol?: number
): number[] {
  const n = initial.length
  const target = pts[pts.length - 1]
  let knots = [...initial]

  /**
   * End offset of the ANALYTIC chain (the geometries that will actually be
   * written) from the run's last input point. The numeric integration below
   * agrees with it only to the integrator's accuracy, and it is the analytic
   * end that has to land on the neighbouring road.
   */
  const endOffset = (k: readonly number[]): { cx: number; cy: number } => {
    const geometries = buildGeometries(k, length, x0, y0, h0)
    const tail = geometries[geometries.length - 1]
    const end = evalGeometry(tail, tail.length)
    return { cx: end.x - target.x, cy: end.y - target.y }
  }

  const evaluate = (k: readonly number[]): { residuals: number[]; cx: number; cy: number } => {
    const curve = integrateCurve(k, length, x0, y0, h0, 8)
    return { residuals: pts.map(p => distToPolyline(p, curve.pts)), ...endOffset(k) }
  }

  const cost = (e: { residuals: number[]; cx: number; cy: number }): number => {
    let sum = 0
    for (const r of e.residuals) sum += r * r
    // The end constraint is scored heavily so a line search never trades it
    // away; the KKT step is what actually drives it to zero.
    return sum + 1e6 * (e.cx * e.cx + e.cy * e.cy)
  }

  let current = evaluate(knots)
  let currentCost = cost(current)

  for (let iter = 0; iter < iterations; iter++) {
    if (Math.hypot(current.cx, current.cy) < END_CONSTRAINT_TOL && iter > 0) break
    // The shape is already as close as it needs to be; only the end constraint
    // is left, and the cheaper Newton phase below closes that. Stopping here
    // skips a numeric Jacobian over every knot, which dominates the cost.
    if (shapeTol !== undefined && Math.max(...current.residuals) <= shapeTol) break
    const m = current.residuals.length
    const jac: number[][] = Array.from({ length: m }, () => new Array(n).fill(0))
    const conJac: number[][] = [new Array(n).fill(0), new Array(n).fill(0)]
    const eps = 1e-7
    for (let j = 0; j < n; j++) {
      const probe = [...knots]
      probe[j] += eps
      const e = evaluate(probe)
      for (let i = 0; i < m; i++) jac[i][j] = (e.residuals[i] - current.residuals[i]) / eps
      conJac[0][j] = (e.cx - current.cx) / eps
      conJac[1][j] = (e.cy - current.cy) / eps
    }

    // Normal equations for the unconstrained part.
    const jtj: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const jtr = new Array(n).fill(0)
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < n; a++) {
        jtr[a] += jac[i][a] * current.residuals[i]
        for (let b = 0; b < n; b++) jtj[a][b] += jac[i][a] * jac[i][b]
      }
    }

    let improved = false
    for (const mu of [1e-6, 1e-4, 1e-2, 1]) {
      // Assemble the KKT system.
      const size = n + 2
      const kkt: number[][] = Array.from({ length: size }, () => new Array(size).fill(0))
      const rhs = new Array(size).fill(0)
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) kkt[a][b] = jtj[a][b]
        kkt[a][a] += mu * (1 + jtj[a][a])
        rhs[a] = -jtr[a]
      }
      for (let c = 0; c < 2; c++) {
        for (let a = 0; a < n; a++) {
          kkt[a][n + c] = conJac[c][a]
          kkt[n + c][a] = conJac[c][a]
        }
      }
      rhs[n] = -current.cx
      rhs[n + 1] = -current.cy
      const solution = solveLinear(kkt, rhs)
      if (!solution) continue
      for (const damp of [1, 0.5, 0.25, 0.1]) {
        const trial = knots.map((v, i) => v + damp * solution[i])
        const e = evaluate(trial)
        const c = cost(e)
        if (c < currentCost) {
          knots = trial
          current = e
          currentCost = c
          improved = true
          break
        }
      }
      if (improved) break
    }
    if (!improved) break
  }

  // Final constraint phase. The shape objective above is a min-over-segments
  // distance, so it is only piecewise smooth and Gauss-Newton stalls on it
  // well before the end constraint is machine-tight. The constraint itself is
  // perfectly smooth, so a few plain Newton steps in the MINIMUM-NORM
  // direction close it out: the step is the smallest change to the knot
  // curvatures that removes the end offset, which leaves the fitted shape
  // essentially untouched (the correction is of the same order as the offset
  // it removes, i.e. sub-millimetre).
  for (let iter = 0; iter < 8; iter++) {
    if (Math.hypot(current.cx, current.cy) <= END_CONSTRAINT_TOL) break
    const conJac: number[][] = [new Array(n).fill(0), new Array(n).fill(0)]
    const eps = 1e-8
    for (let j = 0; j < n; j++) {
      const probe = [...knots]
      probe[j] += eps
      const e = endOffset(probe)
      conJac[0][j] = (e.cx - current.cx) / eps
      conJac[1][j] = (e.cy - current.cy) / eps
    }
    // Minimum-norm solution of C·Δk = −c is Δk = Cᵀ (C Cᵀ)⁻¹ (−c).
    const ccT: number[][] = [
      [0, 0],
      [0, 0],
    ]
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        let sum = 0
        for (let j = 0; j < n; j++) sum += conJac[a][j] * conJac[b][j]
        ccT[a][b] = sum
      }
    }
    const lam = solveLinear(ccT, [-current.cx, -current.cy])
    if (!lam) break
    const trial = knots.map((v, j) => v + conJac[0][j] * lam[0] + conJac[1][j] * lam[1])
    const e = endOffset(trial)
    if (Math.hypot(e.cx, e.cy) >= Math.hypot(current.cx, current.cy)) break
    knots = trial
    current = { residuals: current.residuals, cx: e.cx, cy: e.cy }
  }
  return knots
}

/**
 * Build <spiral>/<arc>/<line> records from knot curvatures.
 *
 * Each record starts at its predecessor's analytically evaluated end pose, so
 * position and heading chain to machine precision; curvature chains because
 * consecutive pieces share a knot value. A piece is rounded down to <arc> when
 * its two knots agree and to <line> when both are zero — the rounding band is
 * far below any curvature that changes the geometry, so it cannot introduce a
 * curvature break the rest of the fit was built to avoid.
 */
function buildGeometries(
  knots: readonly number[],
  length: number,
  x0: number,
  y0: number,
  h0: number
): OdrGeometry[] {
  const pieces = knots.length - 1
  const seg = length / pieces
  const out: OdrGeometry[] = []
  let x = x0
  let y = y0
  let hdg = h0
  let s = 0
  for (let i = 0; i < pieces; i++) {
    const kA = knots[i]
    const kB = knots[i + 1]
    let geometry: OdrGeometry
    if (Math.abs(kA) < LINE_CURVATURE_EPS && Math.abs(kB) < LINE_CURVATURE_EPS) {
      geometry = { kind: 'line', s, x, y, hdg, length: seg }
    } else if (Math.abs(kB - kA) < ARC_CURVATURE_EPS) {
      geometry = { kind: 'arc', s, x, y, hdg, length: seg, curvature: (kA + kB) / 2 }
    } else {
      geometry = { kind: 'spiral', s, x, y, hdg, length: seg, curvStart: kA, curvEnd: kB }
    }
    out.push(geometry)
    const end = evalGeometry(geometry, seg)
    x = end.x
    y = end.y
    hdg = end.hdg
    s += seg
  }
  return out
}

/**
 * Fit one smooth run of reference points with a curvature-continuous chain of
 * OpenDRIVE plan-view primitives.
 *
 * Returns null when no knot count in the sweep meets the tolerances, which the
 * caller must treat as "use the other fitter" rather than as an error: a
 * genuinely folded polyline, a two-point run, or a shape the piecewise-linear
 * curvature model cannot represent at this resolution all land here.
 */
export function fitClothoidRun(
  points: readonly ClothoidFitPoint[],
  options: ClothoidFitOptions
): ClothoidFitResult | null {
  if (points.length < 4) return null
  const profile = headingProfile(points)
  if (!(profile.total > MIN_RUN_LENGTH)) return null

  const x0 = points[0].x
  const y0 = points[0].y
  const h0 = options.startHdg ?? profile.startHdg
  const last = points[points.length - 1]
  const counts = options.knotCounts ?? DEFAULT_KNOT_COUNTS

  for (const knotCount of counts) {
    // More knots than the data can support only fits noise.
    if (knotCount + 1 > profile.s.length) break
    const initial = fitKnotsToHeading(profile, knotCount, h0)
    if (!initial) continue
    // The start heading came from the first chord, which is the tangent half a
    // chord in. Back it out with the curvature the fit just estimated there
    // (unless the caller pinned the heading, in which case it is exact).
    const startHdg =
      options.startHdg ?? profile.startHdg - initial[0] * profile.startChordHalf
    const refined =
      startHdg === h0 ? initial : fitKnotsToHeading(profile, knotCount, startHdg) ?? initial
    const knots = polishKnots(refined, profile.total, points, x0, y0, startHdg, 12, options.posTol)
    const geometries = buildGeometries(knots, profile.total, x0, y0, startHdg)
    if (geometries.length === 0) continue
    const tail = geometries[geometries.length - 1]
    const end = evalGeometry(tail, tail.length)
    const endPosError = Math.hypot(end.x - last.x, end.y - last.y)

    const curve = integrateCurve(knots, profile.total, x0, y0, startHdg, SUBSTEPS_PER_PIECE)
    const maxDeviation = maxDeviationOf(points, curve.pts)
    // Detour guard. Threading every sample says nothing about what the curve
    // does between two of them: it may loop out and come back. Measure each
    // input chord's midpoint against the curve, allowing the sagitta a curve
    // legitimately stands off that chord (h = c²/(8R), with the local radius
    // read from the fitted curvature) plus the shape tolerance. A detour
    // exceeds that by construction; a correct fit on coarse input never does.
    const inputChords = chordStations(points)
    const maxLocalCurvature = Math.max(...knots.map(Math.abs))
    let worstMidpoint = 0
    for (let k = 1; k < points.length; k++) {
      const chord = inputChords[k] - inputChords[k - 1]
      const sagitta = (maxLocalCurvature * chord * chord) / 8
      const mid = {
        x: (points[k - 1].x + points[k].x) / 2,
        y: (points[k - 1].y + points[k].y) / 2,
      }
      worstMidpoint = Math.max(worstMidpoint, distToPolyline(mid, curve.pts) - sagitta)
    }
    if (worstMidpoint > options.posTol) continue
    // The run's end heading is the contact cross-section it shares with
    // whatever follows, so it is held to the same tolerance as the positions.
    // The target is the last chord direction with its own midpoint bias backed
    // out, using the fit's end curvature (the same correction as at the start).
    const endTarget = profile.endHdg + knots[knots.length - 1] * profile.endChordHalf
    const endHdgError = Math.abs(wrapAngle(end.hdg - endTarget))

    if (maxDeviation > options.posTol) continue
    // The run's end is a contact point, not a shape sample: it must be met,
    // not merely approximated. A knot count that leaves it open is rejected in
    // favour of the next one (and ultimately of the fallback fitter).
    if (endPosError > END_CONSTRAINT_ACCEPT_TOL) continue
    if (endHdgError > options.hdgTol) continue

    // Input stations map onto the fit by chord-length proportion; the fitted
    // length differs from the chord length only by the sagitta the fit added.
    const inputStations = chordStations(points)
    const scale = profile.total > 0 ? profile.total / inputStations[inputStations.length - 1] : 1
    return {
      geometries,
      stations: inputStations.map(s => s * scale),
      length: profile.total,
      maxDeviation,
      endPosError,
      knots: knotCount,
    }
  }
  return null
}
