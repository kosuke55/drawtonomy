import { Vec } from '../core/Vec'
import { Point } from '../core/types'

export function getBoundingBox(points: Point[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const pt of points) {
    minX = Math.min(minX, pt.x)
    minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x)
    maxY = Math.max(maxY, pt.y)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Point-to-segment distance using perpendicular projection
 */
export function distanceToSegment(
  point: Point,
  segStart: Point,
  segEnd: Point
): number {
  const a = Vec.of(segStart.x, segStart.y)
  const b = Vec.of(segEnd.x, segEnd.y)
  const p = Vec.of(point.x, point.y)

  const ab = Vec.subtract(b, a)
  const ap = Vec.subtract(p, a)
  const abLen = Vec.length(ab)

  if (abLen === 0) return Vec.distance(p, a)

  // t = clamp(dot(AP, AB) / |AB|^2, 0, 1)
  const t = Math.max(0, Math.min(1, Vec.dot(ap, ab) / (abLen * abLen)))
  const projection = Vec.add(a, Vec.scale(ab, t))

  return Vec.distance(p, projection)
}

/**
 * Cross product sign test for segment intersection
 */
export function segmentsIntersect(
  a1: Point, a2: Point,
  b1: Point, b2: Point
): boolean {
  const d1 = direction(b1, b2, a1)
  const d2 = direction(b1, b2, a2)
  const d3 = direction(a1, a2, b1)
  const d4 = direction(a1, a2, b2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  return false
}

function direction(a: Point, b: Point, c: Point): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)
}

/**
 * Chaikin's corner-cutting subdivision
 */
export function smoothPolyline(points: Point[], iterations: number = 2): Point[] {
  let result = [...points]
  for (let i = 0; i < iterations; i++) {
    const smoothed: Point[] = [result[0]]
    for (let j = 0; j < result.length - 1; j++) {
      const p0 = result[j]
      const p1 = result[j + 1]
      smoothed.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25,
      })
      smoothed.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75,
      })
    }
    smoothed.push(result[result.length - 1])
    result = smoothed
  }
  return result
}
