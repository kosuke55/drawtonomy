// Path → OpenSCENARIO Trajectory conversion utility.
//
// Generates the vertex sequence used by <FollowTrajectoryAction> from a path
// (a polyline + optional footprint configuration).
//
// Input:
//   - Control points in canvas coordinates (px, y-down)
//   - Footprint config (interval/offset, or pre-computed tValues)
//   - Default speed (m/s)
//
// Output:
//   - Per-sample (x_m, y_m, heading_rad, time_sec) in ENU space (y-up)
//
// Modes:
//   - When tValues are provided, each footprint position is mapped to an equal
//     time slice over the total path duration.
//   - Otherwise, footprints are placed at equal arc-length intervals and the
//     time is computed assuming a constant speed.
//
// Coordinate systems:
//   - Input: canvas px (x right +, y down +)
//   - Output: ENU meters (x east +, y north +); heading 0 = +X, CCW positive
//
// Default speed: 10 m/s (≈ 36 km/h, residential).

import { PIXELS_PER_METER } from './units'

export interface PathSamplePoint {
  /** ENU x (m) */
  x: number
  /** ENU y (m) */
  y: number
  /** ENU heading (rad), 0 = +X, CCW positive */
  heading: number
  /** Time since start (s) */
  time: number
}

export interface PathTrajectoryInput {
  /** Path control points in canvas coordinates (px) */
  points: { x: number; y: number }[]
  /** Optional pre-computed normalized positions [0..1] along the path */
  tValues?: number[]
  /** Footprint interval (px), used when tValues is not provided */
  interval?: number
  /** Footprint offset from the start (px), used when tValues is not provided */
  offset?: number
  /** Default speed (m/s); falls back to DEFAULT_PATH_SPEED_MPS */
  speedMps?: number
}

export const DEFAULT_PATH_SPEED_MPS = 10

/**
 * Cumulative arc lengths along the polyline (in input units).
 * Returns an array of the same length as points; cumLen[i] = sum of segment
 * lengths from index 0 to i.
 */
function computeCumulativeLengths(points: { x: number; y: number }[]): number[] {
  const lens: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    lens.push(lens[i - 1] + Math.hypot(dx, dy))
  }
  return lens
}

/**
 * Evaluate the polyline at normalized arc-length parameter t in [0, 1].
 * Returns the interpolated point and tangent direction.
 */
function evaluateAt(
  points: { x: number; y: number }[],
  cumLens: number[],
  t: number
): { x: number; y: number; tangentDx: number; tangentDy: number } {
  const total = cumLens[cumLens.length - 1]
  if (total <= 0 || points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 }
    return { x: p.x, y: p.y, tangentDx: 1, tangentDy: 0 }
  }
  const target = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < points.length; i++) {
    if (cumLens[i] >= target) {
      const segLen = cumLens[i] - cumLens[i - 1]
      const localT = segLen > 1e-9 ? (target - cumLens[i - 1]) / segLen : 0
      const dx = points[i].x - points[i - 1].x
      const dy = points[i].y - points[i - 1].y
      return {
        x: points[i - 1].x + dx * localT,
        y: points[i - 1].y + dy * localT,
        tangentDx: dx,
        tangentDy: dy,
      }
    }
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  return { x: last.x, y: last.y, tangentDx: last.x - prev.x, tangentDy: last.y - prev.y }
}

/**
 * Canvas (px, y-down) → ENU (m, y-up).
 */
function pxToEnu(x: number, y: number): { x: number; y: number } {
  return {
    x: x / PIXELS_PER_METER,
    y: -y / PIXELS_PER_METER,
  }
}

/**
 * Tangent vector (canvas px space, y-down) → ENU heading (rad, y-up).
 * Canvas y is down (CW positive), ENU y is up (CCW positive); flip dy then atan2.
 */
function tangentToEnuHeading(dx: number, dy: number): number {
  return Math.atan2(-dy, dx)
}

/**
 * Build the sample sequence used by <FollowTrajectoryAction> from a path.
 *
 * - tValues mode: each value is treated as a normalized position along the path,
 *   distributed across equal time slices over the total duration. A vertex at
 *   t=0 is prepended when the first tValue is non-zero so the trajectory starts
 *   from the path origin.
 * - interval/offset mode: places samples at equal arc-length intervals and
 *   computes time as cumulative_distance / speed.
 *
 * In both cases time strictly increases (small back-steps are nudged forward
 * by 1 ms because trajectory replay rejects non-monotonic timestamps).
 */
export function buildPathTrajectory(input: PathTrajectoryInput): PathSamplePoint[] {
  const { points, tValues, interval, offset, speedMps } = input
  if (points.length < 2) return []
  const speed = speedMps && speedMps > 0 ? speedMps : DEFAULT_PATH_SPEED_MPS
  const cumLens = computeCumulativeLengths(points)
  const totalLenPx = cumLens[cumLens.length - 1]
  if (totalLenPx <= 0) return []
  const totalLenM = totalLenPx / PIXELS_PER_METER
  const totalDurationSec = totalLenM / speed

  const samples: PathSamplePoint[] = []

  if (tValues && tValues.length > 0) {
    // Prepend the path origin if the first sample is past the start.
    const firstT = tValues[0]
    if (firstT > 1e-6) {
      const start = evaluateAt(points, cumLens, 0)
      const enu = pxToEnu(start.x, start.y)
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(start.tangentDx, start.tangentDy),
        time: 0,
      })
    }
    const N = tValues.length
    const dt = N > 1 ? totalDurationSec / (N - 1) : totalDurationSec
    for (let i = 0; i < N; i++) {
      const t = Math.max(0, Math.min(1, tValues[i]))
      const ev = evaluateAt(points, cumLens, t)
      const enu = pxToEnu(ev.x, ev.y)
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(ev.tangentDx, ev.tangentDy),
        time: i * dt + (firstT > 1e-6 ? dt : 0),
      })
    }
  } else if (interval && interval > 0) {
    // Equal arc-length intervals; time = cumulative_distance / speed.
    const off = offset ?? 0
    let dPx = off
    if (dPx > 1e-6) {
      const start = evaluateAt(points, cumLens, 0)
      const enu = pxToEnu(start.x, start.y)
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(start.tangentDx, start.tangentDy),
        time: 0,
      })
    }
    while (dPx <= totalLenPx + 1e-6) {
      const t = dPx / totalLenPx
      const ev = evaluateAt(points, cumLens, t)
      const enu = pxToEnu(ev.x, ev.y)
      const distM = dPx / PIXELS_PER_METER
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(ev.tangentDx, ev.tangentDy),
        time: distM / speed,
      })
      dPx += interval
    }
    // Force-append the path endpoint if the last interval did not reach it.
    const lastSample = samples[samples.length - 1]
    const endTime = totalDurationSec
    if (Math.abs(lastSample.time - endTime) > 1e-3) {
      const ev = evaluateAt(points, cumLens, 1)
      const enu = pxToEnu(ev.x, ev.y)
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(ev.tangentDx, ev.tangentDy),
        time: endTime,
      })
    }
  } else {
    // Fallback: traverse all control points at constant speed.
    for (let i = 0; i < points.length; i++) {
      const ev = evaluateAt(points, cumLens, cumLens[i] / totalLenPx)
      const enu = pxToEnu(ev.x, ev.y)
      samples.push({
        x: enu.x,
        y: enu.y,
        heading: tangentToEnuHeading(ev.tangentDx, ev.tangentDy),
        time: (cumLens[i] / PIXELS_PER_METER) / speed,
      })
    }
  }

  // Trajectory replay requires strictly increasing time; nudge tiny regressions.
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].time <= samples[i - 1].time) {
      samples[i].time = samples[i - 1].time + 1e-3
    }
  }

  return samples
}
