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
// - The input is only a list of points, so before anything is fitted each
//   interior vertex is classified: may it be read as a sample OF a smooth
//   curve, or is it a fold the author drew? The test is whether the curve
//   reading would move the geometry off the drawn chords by more than the
//   position tolerance (see "Polyline vertices" below). Folds are honoured
//   as <line> endpoints with a heading break (G0); everything else is a
//   curve sample.
// - Position continuity is unconditional: every primitive starts exactly
//   where its predecessor ended. Between curve samples the chaining is also
//   G1 (headings are constrained to the sampled tangents). When no primitive
//   fits even a single step between curve samples, G1 still outranks the
//   position tolerance: such a step takes the unverified Hermite (chain pose
//   -> end sample + sampled tangent) or the chain-tangent arc through the
//   endpoint, rather than a chord that would kink the road.
//
// No external dependencies.

import type { OdrGeometry } from './opendriveParser.js'
import { evalGeometry, type GeomPose } from './odrGeometry.js'
import { fitClothoidRun } from './odrClothoidFit.js'

export interface FitPoint {
  x: number
  y: number
}

/**
 * How much continuity consecutive primitives must share.
 *
 * - `'g2'` (default): curvature-continuous. Smooth runs are fitted with chains
 *   of Euler spirals whose knot curvatures are shared, so a vehicle tracking a
 *   lane offset from the reference line sees no curvature step at any joint.
 * - `'g1'`: position and tangent only, the greedy line/arc/paramPoly3 fit.
 *
 * Folds are unaffected either way: the heading break the author drew is
 * honoured in both modes.
 */
export type PlanViewContinuity = 'g1' | 'g2'

export interface PlanViewFitOptions {
  /** Maximum position deviation between samples and the fit (m). Default 0.05. */
  maxPosErrorMeters?: number
  /** Maximum end-heading deviation per segment (rad). Default 0.5 degrees. */
  maxHdgErrorRad?: number
  /** Moving-median window (odd) for heading de-noising. Default 3; 1 disables. */
  headingMedianWindow?: number
  /** Continuity the fit must deliver between primitives. Default `'g2'`. */
  continuity?: PlanViewContinuity
  /**
   * Tip headings (rad) to use instead of estimating them from the polyline.
   * A road whose contact cross-section must match a neighbour already fitted
   * (a junction connecting road) pins its tips to the neighbour's heading.
   */
  tipHdg?: { start?: number; end?: number }
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
/**
 * Factor above posTol at which a vertex's sagitta marks it as a fold rather
 * than a curve sample. A sampler that refines *to* its tolerance emits
 * vertices whose sagitta lands just under it (worst measured: 0.048 m at the
 * 0.05 m default across the bundled real-world maps), so the threshold must
 * clear the sampler's own output with room to spare. 1.5x does (0.075 m vs
 * 0.048 m) while still catching folds drawn with chords as short as ~2.5 m.
 */
const POLYLINE_SAGITTA_MARGIN = 1.5
/**
 * Fewest points a run needs before the spiral fit is attempted. Below this the
 * heading profile has too few samples to place even one interior knot, and the
 * greedy fitter's single line or arc is both simpler and exact.
 */
const MIN_CLOTHOID_RUN_POINTS = 4
/**
 * Curvature step (1/m) at which a joint counts as discontinuous. Far below the
 * step that produces a measurable acceleration artifact on a lane offset of a
 * few metres, and far above the rounding of an arc emitted with full precision.
 */
const CURVATURE_JOIN_TOL = 1e-9
/**
 * Fraction of the position tolerance by which the curvature-continuous fit may
 * be worse than the greedy one and still be preferred. 10% of 5 cm is 5 mm:
 * far below anything a consumer of the road can act on, and far above the
 * micron-scale differences two converged fits of the same shape show.
 */
const ACCURACY_TIE_FRACTION = 0.1
/**
 * How many times the greedy fit's piece count the spiral chain may use before
 * a tie on accuracy is decided against it. The S-curve pays 16 pieces against
 * 9 (1.8x) and is worth it — there the greedy fit's joints really do step in
 * curvature. A line/arc/line road pays 16 against 4 (4x) for the same
 * accuracy, because the shape's curvature steps and no smooth chain can
 * reproduce that without spending pieces on it.
 */
const PIECE_COUNT_TIE_FACTOR = 2.5

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
 * Endpoint tangent of a run, by the same rule the G1 fitter uses.
 *
 * A chord's direction is the tangent at its arc-length midpoint, so the first
 * chord is NOT the tangent at s = 0 — on a curve it is biased by half a chord
 * of turning. The linear model through the two adjacent chords removes that,
 * except at a tip that is genuinely straight (a line running into an arc, the
 * commonest road shape there is): there the chord IS the tangent, and blending
 * in the next chord would rotate the contact cross-section off the
 * neighbouring road's. The tip counts as straight when its lead turn is at
 * most half the following turn, since a uniform arc shows equal turns while a
 * line-into-arc tip shows a doubled second turn.
 *
 * Exported so the G2 driver pins its runs to exactly this value. A road's end
 * heading is the contact cross-section it shares with its neighbour, and a
 * lane border sits t metres off the reference line: a heading difference of
 * dh there displaces the border by t·dh, which at t = 3.5 m turns 0.4 deg into
 * a 2.5 cm gap. The two fitters must not each invent their own estimate.
 */
export function runTipTangent(
  pts: readonly FitPoint[],
  end: 'start' | 'end',
  hdgTol: number
): number {
  const m = pts.length
  const chordAngle = (i: number): number =>
    Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
  const chordLen = (i: number): number =>
    Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  if (m < 2) return 0
  if (m === 2) return chordAngle(0)
  const tip = (
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
  if (end === 'start') {
    const a01 = chordAngle(0)
    const a12 = chordAngle(1)
    return tip(a01, a12, chordLen(0), chordLen(1), m >= 4 ? wrapAngle(chordAngle(2) - a12) : null)
  }
  const aLast = chordAngle(m - 2)
  const aPrev = chordAngle(m - 3)
  return tip(
    aLast,
    aPrev,
    chordLen(m - 2),
    chordLen(m - 3),
    m >= 4 ? wrapAngle(chordAngle(m - 4) - aPrev) : null
  )
}

/**
 * Classify interior vertices of a polyline as folds (the author drew a corner)
 * or curve samples. See the long-form rationale at the call site in
 * `fitPlanViewG1`; the rule is the sagitta test
 *   h = shorter_chord · sin(θ/2) / 4 > posTol · POLYLINE_SAGITTA_MARGIN.
 *
 * Shared so the G2 driver splits runs on exactly the same vertices the G1
 * fitter breaks heading at — two copies of this rule would drift apart.
 */
export function classifyPolylineVertices(
  pts: readonly FitPoint[],
  posTol: number
): boolean[] {
  const m = pts.length
  const tol = posTol * POLYLINE_SAGITTA_MARGIN
  const flags: boolean[] = new Array(m).fill(false)
  const chordAngle = (i: number): number =>
    Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
  const chordLen = (i: number): number =>
    Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  for (let i = 1; i < m - 1; i++) {
    const defl = Math.abs(wrapAngle(chordAngle(i) - chordAngle(i - 1)))
    if (defl < 1e-12) continue
    const shorter = Math.min(chordLen(i - 1), chordLen(i))
    if (shorter < MIN_SEG_LENGTH) continue
    flags[i] = (shorter * Math.sin(Math.min(defl, Math.PI) / 2)) / 4 > tol
  }
  return flags
}

/**
 * Fit a plan-view primitive sequence to a polyline of reference-line points,
 * chaining primitives G1 (position + tangent).
 *
 * The returned geometries always chain position-exactly (each starts at the
 * previous one's analytic end pose) and never leave the drawn polyline by
 * more than the position tolerance. Heading is continuous too, except at
 * vertices where a smooth reading would itself breach that tolerance — there
 * the fit keeps the chords the caller drew and lets the heading break, which
 * is legal OpenDRIVE since every `<geometry>` carries its own `hdg`.
 */
function fitPlanViewG1(
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
    // The rule itself lives in runTipTangent so the G2 driver can pin its
    // runs to exactly this value rather than inventing a second estimate.
    rawHdg[0] = runTipTangent(pts, 'start', hdgTol)
    rawHdg[m - 1] = runTipTangent(pts, 'end', hdgTol)
  }
  if (options.tipHdg?.start !== undefined) {
    rawHdg[0] = rawHdg[0] + wrapAngle(options.tipHdg.start - rawHdg[0])
  }
  if (options.tipHdg?.end !== undefined) {
    rawHdg[m - 1] = rawHdg[m - 1] + wrapAngle(options.tipHdg.end - rawHdg[m - 1])
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

  // --- Polyline vertices ------------------------------------------------------
  // The input is a bare list of points; nothing in it says whether the author
  // meant a smooth curve sampled at these stations or a polyline whose corners
  // are exactly these vertices. Both readings are legitimate, so the fitter
  // picks the one that does not misrepresent the drawing:
  //
  //   A vertex may be read as a sample OF a smooth curve only when doing so
  //   does not move the geometry away from the drawn chords by more than the
  //   position tolerance.
  //
  // The displacement is measurable in closed form. For interior vertex i with
  // adjacent chords c1, c2 and deflection θ, the circle through vertices
  // i-1, i, i+1 has radius
  //   R = min(c1, c2) / (2·sin(θ/2)),
  // and over a chord of length L that circle departs from the chord by the
  // sagitta
  //   h = L² / (8R).
  // Evaluating it on the shorter chord (the one R is derived from) keeps the
  // measure self-consistent: it is exactly the quantity an adaptive reference-
  // line sampler bounds when it refines a curve until the midpoint chord
  // deviation drops under its tolerance, so a curve sampled *legitimately*
  // always lands at h <= that tolerance while a sparse polyline traced with
  // road-length chords lands far above it.
  //
  // Above the threshold the vertex is a polyline vertex: the fit must pass
  // through it as a <line> endpoint and let the heading break there (G0).
  // Below it the vertex is a curve sample and the usual G1 chaining applies.
  //
  // The threshold sits a factor POLYLINE_SAGITTA_MARGIN above posTol rather
  // than exactly at it, because a sampler that refines *to* its tolerance
  // emits vertices whose sagitta lands just under that tolerance: measured
  // across the bundled real-world maps (esmini, CARLA), the worst curve-sample
  // sagitta is 0.048 m at the 0.05 m default — 96% of the way to the line.
  // Classifying those as folds would shatter genuine curves into chords, so
  // the threshold must clear the sampler's own output with room to spare.
  // 1.5x does that (0.075 m vs the measured 0.048 m) while still catching
  // folds drawn with chords as short as ~2.5 m; a polyline drawn at
  // road scale clears it by an order of magnitude.
  //
  // This subsumes the previous corner rule (a fold tight enough to have been
  // classified a corner — implied radius under a few metres with a sharp
  // deflection — has a sagitta far past any tolerance), so no separate
  // radius test remains.
  // h = L²/(8R) with R = L/(2 sin(θ/2)) collapses to L·sin(θ/2)/4; the rule
  // itself lives in classifyPolylineVertices so the G2 driver shares it.
  const polylineVertex = classifyPolylineVertices(pts, posTol)

  /**
   * End-heading acceptance for a segment ending at sample j. Polyline vertices
   * carry no curve tangent to honour — the geometry is meant to break there —
   * so the constraint is waived. C1 continuity elsewhere is unaffected (it is
   * enforced by chaining start poses, not by this check). The very last sample
   * IS constrained: its heading defines the contact cross-section shared with
   * the successor road, so a primitive may not land there pointing off the
   * data tangent.
   */
  const headingOk = (j: number, endHdg: number): boolean =>
    polylineVertex[j] || Math.abs(wrapAngle(hdg[j] - endHdg)) <= hdgTol

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

  /**
   * Simplest passing primitive for the span [i..j].
   *
   * A span may not swallow a polyline vertex in its interior: a curved
   * primitive drawn through such a vertex is precisely the misrepresentation
   * the classification exists to prevent, and even a <line> through it would
   * erase a fold the author drew. Only <line> may span interior vertices at
   * all here, and only because tryLine additionally checks every one of them
   * against the position tolerance — which a curve-sample vertex passes by
   * definition.
   */
  const spansPolylineVertex = (i: number, j: number): boolean => {
    for (let k = i + 1; k < j; k++) if (polylineVertex[k]) return true
    return false
  }
  const bestFit = (pose: GeomPose, i: number, j: number, chained: boolean): Candidate | null => {
    if (spansPolylineVertex(i, j)) return null
    return tryLine(pose, i, j, chained) ?? tryArc(pose, i, j) ?? tryParamPoly3(pose, i, j)
  }

  // --- Greedy chained segmentation. ------------------------------------------
  const geometries: OdrGeometry[] = []
  const stations: number[] = new Array(m)
  stations[0] = 0
  let pose: GeomPose = { x: pts[0].x, y: pts[0].y, hdg: hdg[0] }
  let sCum = 0
  let i = 0
  while (i < m - 1) {
    // A polyline vertex is where the drawing folds: the incoming tangent has
    // no authority past it. Restart the chain exactly on the vertex and let
    // the next primitive choose its own direction, so the leg leaving the
    // fold is the chord the author drew (and the heading break lands on the
    // vertex, which is legal — every <geometry> carries its own hdg).
    const leavingFold = i > 0 && polylineVertex[i]
    if (leavingFold) pose = { x: pts[i].x, y: pts[i].y, hdg: pose.hdg }
    const chained = geometries.length > 0 && !leavingFold
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
      //  - A polyline vertex on either end of the step: the drawing folds
      //    here, so a heading break at the vertex is what the author drew.
      //    Degrade to the plain chord <line> (position-exact at both
      //    vertices; the break stays confined to the fold).
      //
      //  - A curve-sample vertex the primitive candidates rejected only on
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
      const isFold = polylineVertex[i] || polylineVertex[i + 1]
      // Leaving a fold, the chain heading is the tangent the PREVIOUS piece
      // ended with and carries no authority over this step — honouring it
      // would bend the chord the author drew. Restart the pose on the vertex
      // itself so the emitted chord is exact at both ends.
      if (isFold && polylineVertex[i]) pose = { x: pts[i].x, y: pts[i].y, hdg: pose.hdg }
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
      fit = null
      if (!isFold) {
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

/**
 * Curvature at a primitive's start or end. `null` for a `paramPoly3`, whose
 * curvature is not an attribute of the record — treating it as unknown is what
 * makes a Hermite chain count as curvature-discontinuous below, which is
 * precisely why the spiral fit exists.
 */
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

/**
 * Worst distance between a fitted chain and the points it was fitted to,
 * measured in both directions (samples to curve and curve to samples) so a fit
 * that threads the samples but bulges between them scores the bulge.
 */
function maxSampleDeviation(
  geometries: readonly OdrGeometry[],
  pts: readonly FitPoint[]
): number {
  const curve: FitPoint[] = []
  for (const g of geometries) {
    const n = Math.max(2, Math.ceil(g.length / 0.25))
    for (let k = 0; k <= n; k++) {
      const p = evalGeometry(g, (g.length * k) / n)
      curve.push({ x: p.x, y: p.y })
    }
  }
  if (curve.length < 2) return Infinity
  let worst = 0
  for (const p of pts) worst = Math.max(worst, distToPolyline(p, curve, 0, curve.length - 1))
  for (const c of curve) worst = Math.max(worst, distToPolyline(c, pts, 0, pts.length - 1))
  return worst
}

/** Whether a chain of primitives already shares curvature at every joint. */
function isCurvatureContinuous(geometries: readonly OdrGeometry[]): boolean {
  for (let i = 0; i < geometries.length - 1; i++) {
    const a = boundaryCurvature(geometries[i], 'end')
    const b = boundaryCurvature(geometries[i + 1], 'start')
    if (a === null || b === null) return false
    if (Math.abs(a - b) > CURVATURE_JOIN_TOL) return false
  }
  return true
}

/**
 * Fit a plan-view primitive sequence to a polyline of reference-line points.
 *
 * Default (`continuity: 'g2'`): the polyline is cut at its folds — the
 * vertices the author drew as corners — and each smooth run between two folds
 * is fitted by a chain of Euler spirals sharing knot curvatures, so curvature
 * is continuous everywhere inside a run. That matters because a vehicle
 * driving a lane at lateral offset `t` advances along the reference line at
 * ds = v·dt/(1 − κt): a curvature step at a joint stretches one integration
 * step and shows up as an acceleration spike on an otherwise constant-speed
 * drive. Folds keep their heading break, which is what was drawn.
 *
 * A run the spiral model cannot carry within tolerance (too few points, or a
 * shape it misses) falls back to the greedy line/arc/paramPoly3 fit for that
 * run alone, so G2 never costs accuracy — at worst it yields the G1 result.
 *
 * `continuity: 'g1'` selects the greedy fit for the whole input, reproducing
 * the pre-G2 output exactly.
 *
 * In both modes the geometries chain position-exactly and stay within the
 * position tolerance of the drawn polyline.
 */
export function fitPlanView(
  points: readonly FitPoint[],
  options: PlanViewFitOptions = {}
): PlanViewFit {
  if ((options.continuity ?? 'g2') === 'g1') return fitPlanViewG1(points, options)

  const posTol = options.maxPosErrorMeters ?? 0.05
  const hdgTol = options.maxHdgErrorRad ?? (0.5 * Math.PI) / 180

  // Dedupe exactly as the G1 fitter does, so both paths see the same vertices
  // and a run handed to the fallback is the run the fallback would have built.
  const pts: FitPoint[] = []
  const dedupIndex: number[] = []
  for (const p of points) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > DEDUPE_EPS) {
      pts.push({ x: p.x, y: p.y })
    }
    dedupIndex.push(pts.length - 1)
  }
  if (pts.length >= 2) {
    const lastIn = points[points.length - 1]
    const lastKept = pts[pts.length - 1]
    lastKept.x = lastIn.x
    lastKept.y = lastIn.y
  }
  const m = pts.length
  if (m < MIN_CLOTHOID_RUN_POINTS) return fitPlanViewG1(points, options)

  // Cut at folds: [runStart[k], runStart[k+1]] is one smooth run, sharing its
  // boundary vertices with its neighbours.
  const fold = classifyPolylineVertices(pts, posTol)
  const bounds: number[] = [0]
  for (let i = 1; i < m - 1; i++) if (fold[i]) bounds.push(i)
  bounds.push(m - 1)

  // A run must clear the spiral fit on its own; if any run cannot, that run
  // (and only that run) goes to the greedy fitter.
  const geometries: OdrGeometry[] = []
  const stations: number[] = new Array(m).fill(0)
  let sCum = 0
  let anySpiral = false
  for (let b = 0; b < bounds.length - 1; b++) {
    const i0 = bounds[b]
    const i1 = bounds[b + 1]
    const run = pts.slice(i0, i1 + 1)
    // Both tip headings are pinned to the tangent the rest of the exporter
    // uses (runTipTangent), NOT estimated by the spiral fit. A road's end
    // heading is the contact cross-section its neighbour is built on, and a
    // lane border sits t metres off the reference line, so letting the two
    // fitters disagree by even a fraction of a degree opens a centimetre-scale
    // gap between connected lanes at ordinary lane widths.
    //
    // The one exception is a continuation joint: when this run follows another
    // inside the same plan view, its start heading is the predecessor's exact
    // analytic end, which is what keeps the chain G1 there.
    const startPose = geometries.length > 0 && !fold[i0] ? geometries[geometries.length - 1] : null
    const firstRun = b === 0
    const lastRun = b === bounds.length - 2
    const pinStart = firstRun ? options.tipHdg?.start : undefined
    const pinEnd = lastRun ? options.tipHdg?.end : undefined
    const startHdg = startPose
      ? evalGeometry(startPose, startPose.length).hdg
      : (pinStart ?? runTipTangent(run, 'start', hdgTol))
    const endHdg = pinEnd ?? runTipTangent(run, 'end', hdgTol)
    const runOptions: PlanViewFitOptions = {
      ...options,
      tipHdg: pinStart === undefined && pinEnd === undefined ? undefined : { start: pinStart, end: pinEnd },
    }

    // The greedy fit of this run first: when it already comes out curvature-
    // continuous (a lone line, a lone arc, or a line/arc chain whose joints
    // happen to match) there is nothing for the spiral chain to improve, and
    // it is both simpler and exact. Only a run the greedy fit leaves with a
    // curvature step is worth re-fitting.
    const greedy = fitPlanViewG1(run, runOptions)
    let fitted =
      run.length >= MIN_CLOTHOID_RUN_POINTS && !isCurvatureContinuous(greedy.geometries)
        ? fitClothoidRun(run, { posTol, hdgTol, startHdg, endHdg })
        : null

    // Curvature continuity is not worth buying at the cost of accuracy. Where
    // the run's shape has a curvature STEP (a line meeting an arc), a uniform
    // knot grid can only smooth it, and it overshoots on either side the way
    // any fixed-resolution approximation of a step does — measurably farther
    // off the data than the greedy fit's Hermite transition, and in many more
    // pieces. Keep the greedy fit in that case: the joint it leaves is one
    // curvature step at a place the data itself steps.
    //
    // "Materially worse", not "worse at all". Both fits are converged to the
    // same tolerance, so on a shape they both handle they routinely land
    // within microns of each other, and a strict comparison makes the choice a
    // coin flip that throws away curvature continuity over 0.02 mm. The margin
    // is a fraction of the position tolerance: below it the two fits describe
    // the same road.
    //
    // On such a tie the piece count decides instead. A curvature step costs
    // the spiral chain many pieces to smooth — four times the greedy fit's on
    // a line/arc/line road — and paying that for a road whose curvature steps
    // anyway buys nothing: the step is in the data, not in the fit. A tie that
    // also costs pieces is therefore not a tie.
    if (fitted) {
      const spiralDev = maxSampleDeviation(fitted.geometries, run)
      const greedyDev = maxSampleDeviation(greedy.geometries, run)
      const materiallyWorse = spiralDev > greedyDev + posTol * ACCURACY_TIE_FRACTION
      const tie = spiralDev > greedyDev
      const costlier = fitted.geometries.length > greedy.geometries.length * PIECE_COUNT_TIE_FACTOR
      if (materiallyWorse || (tie && costlier)) fitted = null
    }

    if (fitted) {
      anySpiral = anySpiral || fitted.geometries.some(g => g.kind === 'spiral')
      for (const g of fitted.geometries) {
        geometries.push({ ...g, s: g.s + sCum })
      }
      for (let k = 0; k <= i1 - i0; k++) stations[i0 + k] = sCum + fitted.stations[k]
      sCum += fitted.length
      continue
    }

    // Fallback for this run only: the greedy fit computed above, re-based onto
    // the running station.
    const sub = greedy
    if (sub.geometries.length === 0) {
      for (let k = 0; k <= i1 - i0; k++) stations[i0 + k] = sCum
      continue
    }
    for (const g of sub.geometries) {
      geometries.push({ ...g, s: g.s + sCum })
    }
    for (let k = 0; k <= i1 - i0; k++) stations[i0 + k] = sCum + sub.samplePoses[k].s
    sCum += sub.length
  }

  // A fit with no spiral anywhere carries no G2 benefit, and the greedy fitter
  // reads the whole polyline at once (so it can span a run boundary with one
  // primitive and choose simpler shapes). Prefer it in that case.
  if (!anySpiral) return fitPlanViewG1(points, options)

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
