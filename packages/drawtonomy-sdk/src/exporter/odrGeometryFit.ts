// Plan-view geometry fitting: turns a discrete reference-line polyline into a
// compact sequence of analytic OpenDRIVE primitives (<line>, <arc>,
// <paramPoly3 pRange="arcLength">).
//
// Approach (first principles, no external references):
// - Discrete headings are estimated by central differences and de-noised with
//   a small moving-median filter (robust to single-sample outliers from
//   hand-drawn input).
// - Segments are grown greedily (exponential probing + binary search for the
//   longest fitting span). For each candidate span the simplest primitive
//   wins: a line when all samples stay within the position tolerance of the
//   start ray, else an arc through both endpoints (curvature from the
//   chord/heading geometry of a circle), else a cubic Hermite emitted as
//   paramPoly3. Every accepted fit is verified against the original samples:
//   maximum position deviation <= posTol and end-heading deviation <= hdgTol.
// - C1 continuity is guaranteed by construction: each primitive starts at the
//   analytic end pose of the previous one, and end headings are constrained
//   to the sampled tangents. When no primitive fits even a single step, the
//   span degrades — but G1 continuity is a hard invariant at every non-corner
//   joint (it outranks the position tolerance): such a step takes the
//   unverified Hermite (chain pose -> end sample + sampled tangent) or the
//   chain-tangent arc through the endpoint. Only a genuine corner — a vertex
//   whose implied turn radius is tighter than any drivable road fold —
//   degrades to the plain chord <line>, confining the heading break to the
//   corner itself.
//
// No external dependencies.

import type { OdrGeometry } from './opendriveParser.js'
import { evalGeometry, type GeomPose } from './odrGeometry.js'

export interface FitPoint {
  x: number
  y: number
}

export interface PlanViewFitOptions {
  /** Maximum position deviation between samples and the fit (m). Default 0.05. */
  maxPosErrorMeters?: number
  /** Maximum end-heading deviation per segment (rad). Default 0.5 degrees. */
  maxHdgErrorRad?: number
  /** Moving-median window (odd) for heading de-noising. Default 3; 1 disables. */
  headingMedianWindow?: number
}

/** Station + pose on the fitted reference line for one input sample. */
export interface FittedSamplePose {
  s: number
  x: number
  y: number
  hdg: number
}

export interface PlanViewFit {
  /** Fitted primitives with contiguous stations starting at s = 0. */
  geometries: OdrGeometry[]
  /** Fitted station and pose for every input point (duplicates share poses). */
  samplePoses: FittedSamplePose[]
  /** Total fitted arc length (m). */
  length: number
}

const MIN_SEG_LENGTH = 1e-6
/**
 * Input points closer than this (m) are merged. Sub-2cm spacing carries no
 * road-geometry information at the 5 cm position tolerance — merging shifts
 * the polyline by less than half the tolerance — but its chord directions are
 * noise (snap/weld artifacts at lane ends produce millimeter chords pointing
 * sideways or backwards) that would corrupt the heading estimates.
 */
const DEDUPE_EPS = 0.02
/** Shortest fallback chord worth emitting; closer points snap to the chain. */
const MIN_EMIT_LENGTH = 1e-3
/**
 * Maximum lateral miss allowed for a <line> that ends the whole plan view.
 * Road endpoints are contact points with neighbouring roads (welded in the
 * drawing), so the fitted curve must land on the final input point almost
 * exactly — arcs and Hermites interpolate it by construction, but a line only
 * projects it onto the start ray. Beyond this tolerance the line candidate is
 * rejected and an (endpoint-exact) arc or paramPoly3 takes the span instead.
 */
const LINE_FINAL_LATERAL_TOL = 1e-3
/** Largest |chord-to-heading angle| a single arc / Hermite span may subtend. */
const MAX_TURN_RAD = 1.45

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Distance from p to the polyline pts[i0..i1] (projection onto segments). */
function distToPolyline(p: FitPoint, pts: readonly FitPoint[], i0: number, i1: number): number {
  let best = Infinity
  for (let i = i0; i < i1; i++) {
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

/**
 * Fit a plan-view primitive sequence to a polyline of reference-line samples.
 *
 * The returned geometries are C1-continuous (each starts at the previous
 * one's analytic end pose) except across degraded sharp-corner chords, and
 * deviate from the input samples by at most the position tolerance.
 */
export function fitPlanView(
  points: readonly FitPoint[],
  options: PlanViewFitOptions = {}
): PlanViewFit {
  const posTol = options.maxPosErrorMeters ?? 0.05
  const hdgTol = options.maxHdgErrorRad ?? (0.5 * Math.PI) / 180
  const medianWindow = options.headingMedianWindow ?? 3

  // --- Dedupe coincident input points (duplicates share the same station). --
  const pts: FitPoint[] = []
  const dedupIndex: number[] = []
  for (const p of points) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > DEDUPE_EPS) {
      pts.push({ x: p.x, y: p.y })
    }
    dedupIndex.push(pts.length - 1)
  }
  // The final input point is a contact point with the neighbouring road and
  // must survive exactly: when the dedupe pass merged it into the previous
  // vertex, move that vertex onto it (a sub-DEDUPE_EPS shift, well inside the
  // position tolerance) instead of dropping the true endpoint.
  if (pts.length >= 2) {
    const lastIn = points[points.length - 1]
    const lastKept = pts[pts.length - 1]
    if (lastKept.x !== lastIn.x || lastKept.y !== lastIn.y) {
      lastKept.x = lastIn.x
      lastKept.y = lastIn.y
    }
  }
  const m = pts.length
  if (m < 2) {
    const pose = m === 1 ? { s: 0, x: pts[0].x, y: pts[0].y, hdg: 0 } : { s: 0, x: 0, y: 0, hdg: 0 }
    return { geometries: [], samplePoses: points.map(() => ({ ...pose })), length: 0 }
  }

  // --- Cumulative chord length. ---------------------------------------------
  const u: number[] = [0]
  for (let i = 1; i < m; i++) {
    u.push(u[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }

  // --- Discrete headings: weighted chord blend + unwrap + moving median. ----
  // On any smooth curve, a chord's direction is the tangent at the chord's
  // arc-length midpoint (second order, exact on a circular arc). The tangent
  // at vertex i is therefore the linear (in arc length) interpolation of the
  // two adjacent chord directions, evaluated at u[i]:
  //   hdg(i) = a(i-1,i) + Δa · len(i-1) / (len(i-1) + len(i))
  // which stays circle-exact for arbitrarily uneven spacing — resampled
  // polylines routinely mix metre chords with centimetre slivers, where the
  // uniform-spacing forms (symmetric chord / 1.5·a01 − 0.5·a12) pick up
  // heading errors of κ·Δlen/2 (well past tolerance on curved roads).
  // Endpoints extrapolate the same linear model to u[0] / u[m-1].
  // Sub-tolerance jogs that would corrupt these estimates were already merged
  // away by the dedupe pass above.
  const chordAngle = (i: number): number =>
    Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
  const chordLen = (i: number): number =>
    Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  const rawHdg: number[] = new Array(m)
  if (m === 2) {
    rawHdg[0] = chordAngle(0)
    rawHdg[1] = rawHdg[0]
  } else {
    for (let i = 1; i < m - 1; i++) {
      const a1 = chordAngle(i - 1)
      const a2 = chordAngle(i)
      const l1 = chordLen(i - 1)
      const l2 = chordLen(i)
      rawHdg[i] = a1 + (wrapAngle(a2 - a1) * l1) / (l1 + l2)
    }
    // Endpoint tangents extrapolate the constant-curvature model — but only
    // when the data is actually curving there. Real roads end with straight
    // tips (line+arc+line corner roads are everywhere in OpenDRIVE maps), and
    // for a tip whose first chord lies on the straight piece the chord IS the
    // tangent; blending in the next chord (already inside the arc) would
    // rotate the contact cross-section off the neighbouring road's. The tip
    // counts as straight when its lead turn is at most half the following
    // turn (plus tolerance): a uniform arc shows equal turns and extrapolates,
    // a line-into-arc tip shows a doubled second turn and keeps its chord.
    const tipTangent = (
      aTip: number,
      aNext: number,
      lTip: number,
      lNext: number,
      turnBeyond: number | null
    ): number => {
      const turnTip = wrapAngle(aNext - aTip)
      if (turnBeyond !== null && Math.abs(turnTip) <= Math.abs(turnBeyond) / 2 + hdgTol) {
        return aTip
      }
      return aTip - (turnTip * lTip) / (lTip + lNext)
    }
    const a01 = chordAngle(0)
    const a12 = chordAngle(1)
    rawHdg[0] = tipTangent(
      a01,
      a12,
      chordLen(0),
      chordLen(1),
      m >= 4 ? wrapAngle(chordAngle(2) - a12) : null
    )
    const aLast = chordAngle(m - 2)
    const aPrev = chordAngle(m - 3)
    rawHdg[m - 1] = tipTangent(
      aLast,
      aPrev,
      chordLen(m - 2),
      chordLen(m - 3),
      m >= 4 ? wrapAngle(chordAngle(m - 4) - aPrev) : null
    )
  }
  // Unwrap so the sequence is continuous (no 2π jumps) before filtering.
  for (let i = 1; i < m; i++) {
    rawHdg[i] = rawHdg[i - 1] + wrapAngle(rawHdg[i] - rawHdg[i - 1])
  }
  // Median-filter interior headings only: a truncated window at the ends
  // degenerates to an average, which would re-bias the carefully built
  // second-order endpoint estimates.
  const hdg: number[] = new Array(m)
  const half = Math.max(0, (medianWindow - 1) >> 1)
  for (let i = 0; i < m; i++) {
    if (half === 0 || i < half || i >= m - half) {
      hdg[i] = rawHdg[i]
      continue
    }
    hdg[i] = median(rawHdg.slice(i - half, i + half + 1))
  }

  // --- Corner flags -----------------------------------------------------------
  // A polyline vertex is a genuine corner only when its turn is both sharp
  // AND tight. The deflection angle alone cannot tell a deliberate corner
  // from a smooth curve that was merely sampled coarsely: a road-scale bend
  // traced with long chords shows large per-vertex deflections too. The
  // discriminator is the implied radius of the turn,
  //   R = min(adjacent chord length) / (2·sin(deflection / 2)),
  // the radius of the circle that would produce this deflection over the
  // shorter adjacent chord. Coarsely sampled smooth curves keep R at road
  // scale; only a real fold (an intersection-grade kink, R below a few
  // meters) carries a genuine tangent discontinuity. Only there are
  // end-heading constraints waived (the segmentation naturally breaks at the
  // corner and the heading discontinuity stays on it).
  const CORNER_TURN_RAD = 0.3
  const CORNER_MAX_RADIUS_M = 4
  const corner: boolean[] = new Array(m).fill(false)
  for (let i = 1; i < m - 1; i++) {
    const defl = Math.abs(wrapAngle(chordAngle(i) - chordAngle(i - 1)))
    if (defl <= CORNER_TURN_RAD) continue
    const impliedRadius = Math.min(chordLen(i - 1), chordLen(i)) / (2 * Math.sin(defl / 2))
    corner[i] = impliedRadius < CORNER_MAX_RADIUS_M
  }

  /**
   * End-heading acceptance for a segment ending at sample j. Corners carry no
   * reliable tangent; C1 continuity is unaffected (it is enforced by chaining
   * start poses, not by this check). The very last sample IS constrained: its
   * heading defines the contact cross-section shared with the successor road,
   * so a primitive may not land there pointing off the data tangent.
   */
  const headingOk = (j: number, endHdg: number): boolean =>
    corner[j] || Math.abs(wrapAngle(hdg[j] - endHdg)) <= hdgTol

  // --- Primitive candidates (all endpoint-constrained at the chain pose). ---

  type Candidate = OdrGeometry

  /**
   * Line; passes when all samples hug the ray. Chained segments must follow
   * the chain heading; the very first segment has no incoming tangent to
   * honor, so its direction is the (noise-robust) endpoint chord instead of
   * the local heading estimate at sample 0.
   */
  const tryLine = (pose: GeomPose, i: number, j: number, chained: boolean): Candidate | null => {
    const lineHdg = chained ? pose.hdg : Math.atan2(pts[j].y - pose.y, pts[j].x - pose.x)
    const dirX = Math.cos(lineHdg)
    const dirY = Math.sin(lineHdg)
    const length = (pts[j].x - pose.x) * dirX + (pts[j].y - pose.y) * dirY
    if (length < MIN_SEG_LENGTH) return null
    if (!headingOk(j, lineHdg)) return null
    for (let k = i; k <= j; k++) {
      const dx = pts[k].x - pose.x
      const dy = pts[k].y - pose.y
      const lateral = -dx * dirY + dy * dirX
      // The final input point is a contact point with the neighbouring road;
      // it must sit on the line (not merely within the band), or an
      // endpoint-exact primitive must take the span instead.
      const tol = k === j && j === m - 1 ? Math.min(posTol, LINE_FINAL_LATERAL_TOL) : posTol
      if (Math.abs(lateral) > tol) return null
      const longitudinal = dx * dirX + dy * dirY
      if (longitudinal < -posTol || longitudinal > length + posTol) return null
    }
    return { kind: 'line', s: 0, x: pose.x, y: pose.y, hdg: lineHdg, length }
  }

  /**
   * Arc through the chain pose and the end sample. With chord direction φ and
   * deflection α = φ − hdg, the circle through both endpoints tangent to the
   * start heading has curvature κ = 2·sin(α)/chord and sweeps 2α (classic
   * inscribed-angle relation), so length = 2α/κ.
   */
  const tryArc = (pose: GeomPose, i: number, j: number): Candidate | null => {
    const dx = pts[j].x - pose.x
    const dy = pts[j].y - pose.y
    const chord = Math.hypot(dx, dy)
    if (chord < MIN_SEG_LENGTH) return null
    const alpha = wrapAngle(Math.atan2(dy, dx) - pose.hdg)
    if (Math.abs(alpha) < 1e-12 || Math.abs(alpha) > MAX_TURN_RAD) return null
    const curvature = (2 * Math.sin(alpha)) / chord
    if (Math.abs(curvature) < 1e-12) return null
    const length = (alpha * chord) / Math.sin(alpha)
    if (!headingOk(j, pose.hdg + 2 * alpha)) return null
    // Center / radius checks for the interior samples.
    const cx = pose.x - Math.sin(pose.hdg) / curvature
    const cy = pose.y + Math.cos(pose.hdg) / curvature
    const radius = 1 / Math.abs(curvature)
    const startAngle = Math.atan2(pose.y - cy, pose.x - cx)
    const sweep = curvature * length * Math.sign(curvature) // = |2α|
    const angTol = posTol * Math.abs(curvature) + 1e-9
    for (let k = i + 1; k < j; k++) {
      const radial = Math.hypot(pts[k].x - cx, pts[k].y - cy) - radius
      if (Math.abs(radial) > posTol) return null
      // The sample must lie inside the swept sector (guards against samples
      // that are near the circle but on the opposite side).
      const rel = wrapAngle(Math.atan2(pts[k].y - cy, pts[k].x - cx) - startAngle) * Math.sign(curvature)
      if (rel < -angTol || rel > sweep + angTol) return null
    }
    return { kind: 'arc', s: 0, x: pose.x, y: pose.y, hdg: pose.hdg, length, curvature }
  }

  /**
   * Structural cubic Hermite from the chain pose to the end sample + sampled
   * tangent, expressed in the start-pose frame and emitted as paramPoly3 with
   * pRange="arcLength". The parameter domain is iterated to the curve's
   * actual arc length so evaluating at ds stays close to true arc length;
   * a unit-speed band check rejects fits where that approximation degrades.
   * Returns the candidate plus its verification sampling; it does NOT check
   * position deviation against the input samples — `tryParamPoly3` adds that,
   * while the G1 degrade path deliberately skips it (see the greedy loop).
   */
  const buildHermite = (
    pose: GeomPose,
    i: number,
    j: number
  ): { cand: Candidate; curve: FitPoint[] } | null => {
    const cosH = Math.cos(pose.hdg)
    const sinH = Math.sin(pose.hdg)
    const ex = pts[j].x - pose.x
    const ey = pts[j].y - pose.y
    const u1 = ex * cosH + ey * sinH
    const v1 = -ex * sinH + ey * cosH
    const theta1 = wrapAngle(hdg[j] - pose.hdg)
    if (u1 < MIN_SEG_LENGTH) return null
    if (Math.abs(theta1) > MAX_TURN_RAD) return null
    // Spans shorter than a few tolerances never need a cubic: the chord line
    // already sits within tolerance, and a Hermite squeezed into a tiny span
    // can only produce huge, meaningless coefficients.
    if (Math.hypot(ex, ey) < 4 * posTol) return null
    const cosT = Math.cos(theta1)
    const sinT = Math.sin(theta1)

    // Hermite boundary conditions with parameter domain [0, L]:
    //   u(0)=0, u'(0)=1, u(L)=u1, u'(L)=cosθ1   (aU=0, bU=1)
    //   v(0)=0, v'(0)=0, v(L)=v1, v'(L)=sinθ1   (aV=0, bV=0)
    let L = Math.max(u[j] - u[i], Math.hypot(ex, ey))
    if (L < MIN_SEG_LENGTH) return null
    let cU = 0
    let dU = 0
    let cV = 0
    let dV = 0
    const solve = (dom: number): void => {
      const A = u1 - dom
      const B = cosT - 1
      cU = (3 * A - B * dom) / (dom * dom)
      dU = (B * dom - 2 * A) / (dom * dom * dom)
      cV = (3 * v1 - sinT * dom) / (dom * dom)
      dV = (sinT * dom - 2 * v1) / (dom * dom * dom)
    }
    const arcLength = (dom: number): number => {
      const n = Math.max(16, Math.min(512, Math.ceil(dom / 0.25)))
      let acc = 0
      let px = 0
      let py = 0
      for (let k = 1; k <= n; k++) {
        const p = (dom * k) / n
        const x = p * (1 + p * (cU + p * dU))
        const y = p * p * (cV + p * dV)
        acc += Math.hypot(x - px, y - py)
        px = x
        py = y
      }
      return acc
    }
    for (let iter = 0; iter < 3; iter++) {
      solve(L)
      const actual = arcLength(L)
      if (!(actual > MIN_SEG_LENGTH)) return null
      if (Math.abs(actual - L) < 1e-6) break
      L = actual
    }
    solve(L)

    // Verification sampling of the candidate in inertial coordinates.
    const n = Math.max(8, Math.min(512, Math.ceil(L / 0.5)))
    const curve: FitPoint[] = []
    for (let k = 0; k <= n; k++) {
      const p = (L * k) / n
      const lu = p * (1 + p * (cU + p * dU))
      const lv = p * p * (cV + p * dV)
      curve.push({ x: pose.x + lu * cosH - lv * sinH, y: pose.y + lu * sinH + lv * cosH })
      // Unit-speed band: |r'(p)| must stay near 1 for arcLength pRange.
      const du = 1 + p * (2 * cU + p * 3 * dU)
      const dv = p * (2 * cV + p * 3 * dV)
      const speed = Math.hypot(du, dv)
      if (speed < 0.5 || speed > 1.6) return null
    }
    return {
      cand: {
        kind: 'paramPoly3',
        s: 0,
        x: pose.x,
        y: pose.y,
        hdg: pose.hdg,
        length: L,
        aU: 0,
        bU: 1,
        cU,
        dU,
        aV: 0,
        bV: 0,
        cV,
        dV,
        pRange: 'arcLength',
      },
      curve,
    }
  }

  /** Hermite candidate verified against the input samples (both directions). */
  const tryParamPoly3 = (pose: GeomPose, i: number, j: number): Candidate | null => {
    const h = buildHermite(pose, i, j)
    if (!h) return null
    // Samples -> curve and curve -> samples (the latter catches wiggles
    // between sample stations).
    for (let k = i + 1; k < j; k++) {
      if (distToPolyline(pts[k], h.curve, 0, h.curve.length - 1) > posTol) return null
    }
    for (const cp of h.curve) {
      if (distToPolyline(cp, pts, i, j) > posTol) return null
    }
    return h.cand
  }

  /** Simplest passing primitive for the span [i..j]. */
  const bestFit = (pose: GeomPose, i: number, j: number, chained: boolean): Candidate | null =>
    tryLine(pose, i, j, chained) ?? tryArc(pose, i, j) ?? tryParamPoly3(pose, i, j)

  // --- Greedy chained segmentation. ------------------------------------------
  const geometries: OdrGeometry[] = []
  const stations: number[] = new Array(m)
  stations[0] = 0
  let pose: GeomPose = { x: pts[0].x, y: pts[0].y, hdg: hdg[0] }
  let sCum = 0
  let i = 0
  while (i < m - 1) {
    const chained = geometries.length > 0
    let fit = bestFit(pose, i, i + 1, chained)
    let j = i + 1
    if (fit) {
      // Exponential probing for the longest fitting span, then binary search
      // between the last success and the first failure.
      let step = 1
      while (j < m - 1) {
        step *= 2
        const probe = Math.min(j + step, m - 1)
        const f = bestFit(pose, i, probe, chained)
        if (f) {
          j = probe
          fit = f
          continue
        }
        let lo = j
        let hi = probe
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1
          const fm = bestFit(pose, i, mid, chained)
          if (fm) {
            lo = mid
            fit = fm
          } else {
            hi = mid
          }
        }
        j = lo
        break
      }
    } else {
      // No primitive fit even a single step. Two very different situations
      // reach here and must be resolved differently:
      //
      //  - A genuine corner (implied turn radius below CORNER_MAX_RADIUS_M):
      //    its tangent is undefined, so a heading break at the vertex is
      //    correct. Degrade to the plain chord <line> (position-continuous;
      //    the break stays confined to the corner).
      //
      //  - A non-corner vertex the primitive candidates rejected only on
      //    tolerance — e.g. a cubic whose sampled-tangent endpoint condition
      //    makes it bulge just past posTol on a coarse step. Here G1
      //    continuity is a hard invariant that outranks the position
      //    tolerance: a few centimeters of positional slack are invisible on
      //    a road, but a heading jump of several degrees is a kink a vehicle
      //    would snap its orientation across in a single frame. Emit the
      //    unverified Hermite (starts at the chain pose, ends on the sampled
      //    tangent, so BOTH joints stay G1 and the chain heading keeps
      //    tracking the data tangents), falling back to the chain-tangent
      //    arc through the endpoint (C1 at its start joint) and only then —
      //    for pathological steps such as reversals — to the chord line.
      const cdx = pts[i + 1].x - pose.x
      const cdy = pts[i + 1].y - pose.y
      const chord = Math.hypot(cdx, cdy)
      if (chord < MIN_EMIT_LENGTH) {
        // A sub-millimeter leftover (e.g. chain drift at the very end) is not
        // worth a geometry record; snap the point onto the chain instead.
        stations[i + 1] = sCum
        i++
        continue
      }
      const chordHdg = Math.atan2(cdy, cdx)
      const deflection = wrapAngle(chordHdg - pose.hdg)
      const isCorner = corner[i] || corner[i + 1]
      fit = null
      if (!isCorner) {
        if (Math.abs(deflection) <= 1e-9) {
          // Endpoint already lies on the incoming ray: a chain-heading line
          // keeps C1 (the raw chord heading would equal it here anyway).
          fit = { kind: 'line', s: 0, x: pose.x, y: pose.y, hdg: pose.hdg, length: chord }
        } else {
          fit = buildHermite(pose, i, i + 1)?.cand ?? null
          if (!fit && Math.abs(2 * deflection) <= MAX_TURN_RAD) {
            // Arc from the chain pose through the endpoint (same
            // inscribed-angle construction as tryArc): κ = 2·sin(deflection)
            // / chord, length = deflection·chord/sin(deflection).
            const curvature = (2 * Math.sin(deflection)) / chord
            fit = {
              kind: 'arc',
              s: 0,
              x: pose.x,
              y: pose.y,
              hdg: pose.hdg,
              length: (deflection * chord) / Math.sin(deflection),
              curvature,
            }
          }
        }
      }
      if (!fit) {
        // Genuine corner (or a pathological step no continuous primitive can
        // take): plain chord line, heading break confined to the vertex.
        fit = { kind: 'line', s: 0, x: pose.x, y: pose.y, hdg: chordHdg, length: chord }
      }
    }
    fit.s = sCum
    geometries.push(fit)
    const span = u[j] - u[i]
    for (let k = i + 1; k <= j; k++) {
      stations[k] = span > 0 ? sCum + (fit.length * (u[k] - u[i])) / span : sCum
    }
    pose = evalGeometry(fit, fit.length)
    sCum += fit.length
    i = j
  }

  // --- Poses on the fitted curve for every input sample. ---------------------
  const posesByDedup: FittedSamplePose[] = new Array(m)
  let gIdx = 0
  for (let k = 0; k < m; k++) {
    const s = Math.min(stations[k], sCum)
    while (gIdx < geometries.length - 1 && geometries[gIdx + 1].s <= s + 1e-12) gIdx++
    const g = geometries[gIdx]
    const p = evalGeometry(g, Math.min(Math.max(s - g.s, 0), g.length))
    posesByDedup[k] = { s, x: p.x, y: p.y, hdg: p.hdg }
  }

  return {
    geometries,
    samplePoses: dedupIndex.map(d => posesByDedup[d]),
    length: sCum,
  }
}
