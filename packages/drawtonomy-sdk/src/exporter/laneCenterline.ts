// Lane centerline + width sample utilities. Computes a centerline and
// per-sample lane width from two boundary point sequences. Used by the
// OpenDRIVE exporter to emit reference lines and lane widths.

export interface Point2D {
  x: number
  y: number
}

export interface CenterlineSample {
  x: number
  y: number
  width: number
  s: number
}

/**
 * Build a centerline + lane-width sample sequence from two boundary point
 * sequences.
 *
 * Approach:
 * - Sample both boundaries at the same normalized arc-length parameter t (0..1)
 * - Take the midpoint of the two sampled points as the centerline
 * - Take the distance between the two as the lane width at that sample
 *
 * Stable for boundaries with different point counts or lengths.
 *
 * @param left - left boundary point sequence (in travel direction)
 * @param right - right boundary point sequence (same direction)
 * @param numSamples - number of output samples; 0 = max(left.length, right.length)
 */
export function computeCenterlineWithWidth(
  left: Point2D[],
  right: Point2D[],
  numSamples: number = 0
): CenterlineSample[] {
  if (left.length < 2 || right.length < 2) return []

  const n = numSamples > 0 ? numSamples : Math.max(left.length, right.length)
  const samples: CenterlineSample[] = []

  let s = 0
  let prev: Point2D | null = null

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const lp = sampleAtParam(left, t)
    const rp = sampleAtParam(right, t)
    const cx = (lp.x + rp.x) / 2
    const cy = (lp.y + rp.y) / 2
    const width = Math.hypot(lp.x - rp.x, lp.y - rp.y)

    if (prev) s += Math.hypot(cx - prev.x, cy - prev.y)
    samples.push({ x: cx, y: cy, width, s })
    prev = { x: cx, y: cy }
  }

  return samples
}

/**
 * Linearly interpolate a point on a polyline at normalized arc-length
 * parameter t in [0, 1].
 */
export function sampleAtParam(points: Point2D[], t: number): Point2D {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y }
  if (t <= 0) return { x: points[0].x, y: points[0].y }
  if (t >= 1) {
    const last = points[points.length - 1]
    return { x: last.x, y: last.y }
  }

  // Cumulative arc length.
  const lens: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const total = lens[lens.length - 1]
  if (total === 0) return { x: points[0].x, y: points[0].y }

  const target = t * total
  for (let i = 1; i < points.length; i++) {
    if (lens[i] >= target) {
      const segLen = lens[i] - lens[i - 1]
      const localT = segLen === 0 ? 0 : (target - lens[i - 1]) / segLen
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * localT,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * localT,
      }
    }
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y }
}

/**
 * Compute per-sample heading (tangent direction, radians) for a centerline.
 * heading[i] is the direction from sample[i] to sample[i+1]; the last entry
 * repeats the previous one.
 */
export function computeHeadings(samples: CenterlineSample[]): number[] {
  if (samples.length === 0) return []
  const headings: number[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const dx = samples[i + 1].x - samples[i].x
    const dy = samples[i + 1].y - samples[i].y
    headings.push(Math.atan2(dy, dx))
  }
  headings.push(headings[headings.length - 1] ?? 0)
  return headings
}
