// Analytic evaluation of OpenDRIVE plan-view geometry.
//
// Supported primitives: line, arc, spiral (Euler clothoid via Fresnel
// integrals), paramPoly3 (both pRange modes), and the deprecated poly3.
// `sampleReferenceLine` adaptively samples a road's reference line under a
// maximum chord error + maximum step, always including geometry boundaries
// (and any caller-supplied stations such as laneSection starts).
//
// No external dependencies.

import type { OdrCubic, OdrGeometry, OdrRoad } from './opendriveParser'

/** Pose on the reference line: inertial position + heading. */
export interface GeomPose {
  x: number
  y: number
  hdg: number
}

// ---------------------------------------------------------------------------
// Fresnel integrals
// ---------------------------------------------------------------------------

/**
 * Fresnel integrals in the normalized convention:
 *   C(t) = ∫₀ᵗ cos(π u² / 2) du,   S(t) = ∫₀ᵗ sin(π u² / 2) du
 *
 * Implementation follows the classic two-regime scheme (see Abramowitz &
 * Stegun §7.3 and Press et al., "Numerical Recipes", §6.9 "Fresnel Integrals"):
 *   - |t| ≤ 1.5: power series expansion (A&S 7.3.11/7.3.13), which converges
 *     rapidly in this range.
 *   - |t| > 1.5: evaluation through the complex continued fraction for the
 *     related complementary error function, computed with the modified Lentz
 *     algorithm. Accuracy is limited only by EPS (~1e-12 here), far better
 *     than the ~1e-8 needed for sub-millimeter road geometry.
 *
 * Both C and S are odd functions, so negative arguments are handled by sign.
 */
export function fresnel(t: number): { C: number; S: number } {
  const EPS = 1e-12
  const MAXIT = 120
  const SERIES_MAX = 1.5
  const ax = Math.abs(t)
  let c: number
  let s: number

  if (ax < 1e-30) {
    c = ax
    s = 0
  } else if (ax <= SERIES_MAX) {
    // Power series (A&S 7.3.11 / 7.3.13):
    //   C(x) = Σ (-1)^n (π/2)^(2n)   x^(4n+1) / ((2n)!   (4n+1))
    //   S(x) = Σ (-1)^n (π/2)^(2n+1) x^(4n+3) / ((2n+1)! (4n+3))
    const h = (Math.PI / 2) * ax * ax
    const h2 = h * h
    let cTerm = ax // x * (π/2 x²)^0 / 0!
    let sTerm = ax * h // x * (π/2 x²)^1 / 1!
    c = cTerm // n = 0 contribution: cTerm / 1
    s = sTerm / 3 // n = 0 contribution: sTerm / 3
    for (let n = 1; n <= MAXIT; n++) {
      cTerm *= -h2 / ((2 * n - 1) * (2 * n))
      sTerm *= -h2 / ((2 * n) * (2 * n + 1))
      const dc = cTerm / (4 * n + 1)
      const ds = sTerm / (4 * n + 3)
      c += dc
      s += ds
      if (Math.abs(dc) + Math.abs(ds) < EPS * (Math.abs(c) + Math.abs(s))) break
    }
  } else {
    // Complex continued fraction via modified Lentz (Numerical Recipes §6.9).
    const pix2 = Math.PI * ax * ax
    let bRe = 1
    let bIm = -pix2
    const BIG = 1e100
    let ccRe = BIG
    let ccIm = 0
    let den = bRe * bRe + bIm * bIm
    let dRe = bRe / den
    let dIm = -bIm / den
    let hRe = dRe
    let hIm = dIm
    let n = -1
    for (let k = 2; k <= MAXIT; k++) {
      n += 2
      const a = -n * (n + 1)
      bRe += 4
      // d = 1 / (a*d + b)
      let tRe = a * dRe + bRe
      let tIm = a * dIm + bIm
      den = tRe * tRe + tIm * tIm
      dRe = tRe / den
      dIm = -tIm / den
      // cc = b + a / cc
      den = ccRe * ccRe + ccIm * ccIm
      ccRe = bRe + (a * ccRe) / den
      ccIm = bIm - (a * ccIm) / den
      // del = cc * d ; h *= del
      const delRe = ccRe * dRe - ccIm * dIm
      const delIm = ccRe * dIm + ccIm * dRe
      tRe = hRe * delRe - hIm * delIm
      tIm = hRe * delIm + hIm * delRe
      hRe = tRe
      hIm = tIm
      if (Math.abs(delRe - 1) + Math.abs(delIm) < EPS) break
    }
    // h *= (ax - i*ax)
    const t2Re = ax * (hRe + hIm)
    const t2Im = ax * (hIm - hRe)
    hRe = t2Re
    hIm = t2Im
    // cs = (0.5 + 0.5i) * (1 - (cos(πx²/2) + i sin(πx²/2)) * h)
    const cosv = Math.cos(0.5 * pix2)
    const sinv = Math.sin(0.5 * pix2)
    const mRe = 1 - (cosv * hRe - sinv * hIm)
    const mIm = -(cosv * hIm + sinv * hRe)
    c = 0.5 * (mRe - mIm)
    s = 0.5 * (mRe + mIm)
  }

  if (t < 0) {
    c = -c
    s = -s
  }
  return { C: c, S: s }
}

// ---------------------------------------------------------------------------
// Geometry evaluation
// ---------------------------------------------------------------------------

/** Evaluate a cubic polynomial record at a local offset ds. */
export function evalPoly3(rec: OdrCubic, ds: number): number {
  return rec.a + ds * (rec.b + ds * (rec.c + ds * rec.d))
}

/** Derivative of a cubic polynomial record at a local offset ds. */
export function evalPoly3Derivative(rec: OdrCubic, ds: number): number {
  return rec.b + ds * (2 * rec.c + ds * 3 * rec.d)
}

const CURVATURE_EPS = 1e-12

function evalLine(geom: { x: number; y: number; hdg: number }, ds: number): GeomPose {
  return {
    x: geom.x + Math.cos(geom.hdg) * ds,
    y: geom.y + Math.sin(geom.hdg) * ds,
    hdg: geom.hdg,
  }
}

function evalArc(geom: { x: number; y: number; hdg: number }, curvature: number, ds: number): GeomPose {
  if (Math.abs(curvature) < CURVATURE_EPS) return evalLine(geom, ds)
  const hdg1 = geom.hdg + curvature * ds
  return {
    x: geom.x + (Math.sin(hdg1) - Math.sin(geom.hdg)) / curvature,
    y: geom.y - (Math.cos(hdg1) - Math.cos(geom.hdg)) / curvature,
    hdg: hdg1,
  }
}

/**
 * Evaluate an Euler spiral (clothoid) with linearly varying curvature.
 *
 * The general spiral maps onto the unit clothoid κ(σ) = cDot·σ via the
 * standard parameter transform (a textbook property of the Euler spiral —
 * see e.g. Abramowitz & Stegun §7.3 on Fresnel integrals):
 * the road geometry covers the parameter window σ ∈ [s0, s0 + ds] with
 * s0 = curvStart / cDot. On that base clothoid,
 *   position(σ) = scale · (C(σ/scale), sign(cDot) · S(σ/scale)),
 *   tangent(σ)  = cDot · σ² / 2,
 * with scale = sqrt(π / |cDot|). The window is then rotated/translated so
 * that its start coincides with the geometry's (x, y, hdg).
 */
function evalSpiral(
  geom: { x: number; y: number; hdg: number; length: number },
  curvStart: number,
  curvEnd: number,
  ds: number
): GeomPose {
  const cDot = (curvEnd - curvStart) / geom.length
  if (Math.abs(cDot) < CURVATURE_EPS) {
    // Degenerate spiral: constant curvature (arc) or straight line.
    return evalArc(geom, curvStart, ds)
  }
  const s0 = curvStart / cDot
  const scale = Math.sqrt(Math.PI / Math.abs(cDot))
  const sgn = Math.sign(cDot)

  const clothoid = (sigma: number): { x: number; y: number } => {
    const f = fresnel(sigma / scale)
    return { x: scale * f.C, y: sgn * scale * f.S }
  }

  const p0 = clothoid(s0)
  const p1 = clothoid(s0 + ds)
  const theta0 = 0.5 * cDot * s0 * s0
  const rot = geom.hdg - theta0
  const cosR = Math.cos(rot)
  const sinR = Math.sin(rot)
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  return {
    x: geom.x + dx * cosR - dy * sinR,
    y: geom.y + dx * sinR + dy * cosR,
    hdg: geom.hdg + curvStart * ds + 0.5 * cDot * ds * ds,
  }
}

function evalParamPoly3(
  geom: Extract<OdrGeometry, { kind: 'paramPoly3' }>,
  ds: number
): GeomPose {
  const p = geom.pRange === 'arcLength' ? ds : geom.length > 0 ? ds / geom.length : 0
  const u = geom.aU + p * (geom.bU + p * (geom.cU + p * geom.dU))
  const v = geom.aV + p * (geom.bV + p * (geom.cV + p * geom.dV))
  const du = geom.bU + p * (2 * geom.cU + p * 3 * geom.dU)
  const dv = geom.bV + p * (2 * geom.cV + p * 3 * geom.dV)
  const cosH = Math.cos(geom.hdg)
  const sinH = Math.sin(geom.hdg)
  return {
    x: geom.x + u * cosH - v * sinH,
    y: geom.y + u * sinH + v * cosH,
    hdg: geom.hdg + Math.atan2(dv, du),
  }
}

function evalCubicPoly3(geom: Extract<OdrGeometry, { kind: 'poly3' }>, ds: number): GeomPose {
  // Deprecated primitive (replaced by paramPoly3 in OpenDRIVE 1.6). The
  // polynomial is v(u) in the local frame; we approximate the local abscissa
  // u by the arc length ds, which is exact for flat curves and a small
  // overestimate for strongly bent ones. Callers surface this as a warning.
  const u = ds
  const v = evalPoly3(geom, u)
  const dv = evalPoly3Derivative(geom, u)
  const cosH = Math.cos(geom.hdg)
  const sinH = Math.sin(geom.hdg)
  return {
    x: geom.x + u * cosH - v * sinH,
    y: geom.y + u * sinH + v * cosH,
    hdg: geom.hdg + Math.atan2(dv, 1),
  }
}

/**
 * Evaluate a plan-view geometry at offset `ds` (m) from its start.
 * Returns the inertial position and heading.
 */
export function evalGeometry(geom: OdrGeometry, ds: number): GeomPose {
  switch (geom.kind) {
    case 'line':
      return evalLine(geom, ds)
    case 'arc':
      return evalArc(geom, geom.curvature, ds)
    case 'spiral':
      return evalSpiral(geom, geom.curvStart, geom.curvEnd, ds)
    case 'paramPoly3':
      return evalParamPoly3(geom, ds)
    case 'poly3':
      return evalCubicPoly3(geom, ds)
  }
}

// ---------------------------------------------------------------------------
// Adaptive reference-line sampling
// ---------------------------------------------------------------------------

export interface SampleReferenceLineOptions {
  /** Maximum allowed chord deviation at the midpoint of a step (m). Default 0.05. */
  maxChordErrorMeters?: number
  /** Maximum station spacing (m). Default 5. */
  maxStepMeters?: number
  /**
   * Additional stations that must appear in the output (e.g. laneSection
   * starts, laneOffset breakpoints). Values outside [0, road.length] are
   * clamped/ignored.
   */
  extraStations?: readonly number[]
}

export interface ReferenceSample {
  /** Station along the road reference line (m). */
  s: number
  x: number
  y: number
  hdg: number
}

const STATION_EPS = 1e-9
const MIN_STEP = 1e-3
const MAX_REFINE_DEPTH = 32

/** Distance from point p to the chord segment a-b. */
function chordDeviation(
  a: { x: number; y: number },
  b: { x: number; y: number },
  p: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Adaptively sample a road's reference line.
 *
 * Stations always include s = 0, s = road.length, every plan-view geometry
 * boundary, and the caller's `extraStations`. Between those, intervals are
 * recursively bisected until the chord deviation at the interval midpoint is
 * below `maxChordErrorMeters` and the step is at most `maxStepMeters`.
 */
export function sampleReferenceLine(
  road: OdrRoad,
  options: SampleReferenceLineOptions = {}
): ReferenceSample[] {
  const tol = options.maxChordErrorMeters ?? 0.05
  const maxStep = options.maxStepMeters ?? 5
  const roadLength = road.length

  if (road.planView.length === 0 || roadLength <= 0) return []

  // Base stations: geometry boundaries + caller stations + road ends.
  const baseSet: number[] = [0, roadLength]
  for (const g of road.planView) {
    if (g.s > 0 && g.s < roadLength) baseSet.push(g.s)
    const end = g.s + g.length
    if (end > 0 && end < roadLength) baseSet.push(end)
  }
  if (options.extraStations) {
    for (const s of options.extraStations) {
      if (s > 0 && s < roadLength) baseSet.push(s)
    }
  }
  baseSet.sort((a, b) => a - b)
  const base: number[] = []
  for (const s of baseSet) {
    if (base.length === 0 || s - base[base.length - 1] > STATION_EPS) base.push(s)
  }

  // Locate the geometry containing a station (last geometry with g.s <= s).
  const geomAt = (s: number): OdrGeometry => {
    let found = road.planView[0]
    for (const g of road.planView) {
      if (g.s <= s + STATION_EPS) found = g
      else break
    }
    return found
  }

  const evalAt = (s: number): GeomPose => {
    const g = geomAt(s)
    return evalGeometry(g, Math.min(Math.max(s - g.s, 0), g.length))
  }

  const stations: number[] = []
  const refine = (sa: number, sb: number, pa: GeomPose, pb: GeomPose, depth: number): void => {
    const step = sb - sa
    if (step > MIN_STEP && depth < MAX_REFINE_DEPTH) {
      const sm = (sa + sb) / 2
      const pm = evalAt(sm)
      if (step > maxStep || chordDeviation(pa, pb, pm) > tol) {
        refine(sa, sm, pa, pm, depth + 1)
        refine(sm, sb, pm, pb, depth + 1)
        return
      }
    }
    stations.push(sa)
  }

  for (let i = 0; i < base.length - 1; i++) {
    refine(base[i], base[i + 1], evalAt(base[i]), evalAt(base[i + 1]), 0)
  }
  stations.push(roadLength)

  return stations.map(s => {
    const pose = evalAt(s)
    return { s, x: pose.x, y: pose.y, hdg: pose.hdg }
  })
}
