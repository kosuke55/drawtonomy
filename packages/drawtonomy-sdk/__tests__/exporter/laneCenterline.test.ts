import { describe, it, expect } from 'vitest'
import {
  computeCenterlineWithWidth,
  sampleAtParam,
  computeHeadings,
} from '../../src/exporter/laneCenterline'

describe('sampleAtParam', () => {
  it('returns first point at t=0', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
    expect(sampleAtParam(pts, 0)).toEqual({ x: 0, y: 0 })
  })

  it('returns last point at t=1', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
    expect(sampleAtParam(pts, 1)).toEqual({ x: 20, y: 0 })
  })

  it('linearly interpolates by arc length', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]
    const p = sampleAtParam(pts, 0.5)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(0)
  })

  it('handles non-uniform segment lengths', () => {
    // Total length = 30 (10 + 20). t=0.5 → arc length 15 → middle of second segment.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }]
    const p = sampleAtParam(pts, 0.5)
    expect(p.x).toBeCloseTo(15)
  })
})

describe('computeCenterlineWithWidth', () => {
  it('produces midpoint and constant width for parallel straight boundaries', () => {
    const left = [{ x: 0, y: -5 }, { x: 100, y: -5 }]
    const right = [{ x: 0, y: 5 }, { x: 100, y: 5 }]
    const samples = computeCenterlineWithWidth(left, right, 5)
    expect(samples).toHaveLength(5)
    samples.forEach((s) => {
      expect(s.y).toBeCloseTo(0)
      expect(s.width).toBeCloseTo(10)
    })
    expect(samples[0].x).toBeCloseTo(0)
    expect(samples[4].x).toBeCloseTo(100)
  })

  it('returns empty array when boundaries have fewer than 2 points', () => {
    expect(computeCenterlineWithWidth([{ x: 0, y: 0 }], [{ x: 0, y: 1 }, { x: 1, y: 1 }])).toEqual([])
  })

  it('width reflects diverging boundaries', () => {
    const left = [{ x: 0, y: -5 }, { x: 100, y: -10 }]
    const right = [{ x: 0, y: 5 }, { x: 100, y: 10 }]
    const samples = computeCenterlineWithWidth(left, right, 3)
    expect(samples[0].width).toBeCloseTo(10)
    expect(samples[2].width).toBeCloseTo(20)
  })
})

describe('computeHeadings', () => {
  it('returns 0 radians for x-axis aligned line', () => {
    const samples = [
      { x: 0, y: 0, width: 10, s: 0 },
      { x: 10, y: 0, width: 10, s: 10 },
      { x: 20, y: 0, width: 10, s: 20 },
    ]
    const h = computeHeadings(samples)
    expect(h).toHaveLength(3)
    h.forEach((angle) => expect(angle).toBeCloseTo(0))
  })

  it('returns pi/2 for y-axis going up', () => {
    const samples = [
      { x: 0, y: 0, width: 10, s: 0 },
      { x: 0, y: 10, width: 10, s: 10 },
    ]
    const h = computeHeadings(samples)
    expect(h[0]).toBeCloseTo(Math.PI / 2)
  })
})
