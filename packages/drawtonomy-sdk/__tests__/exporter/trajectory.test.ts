import { describe, it, expect } from 'vitest'
import { buildPathTrajectory, DEFAULT_PATH_SPEED_MPS } from '../../src/exporter/trajectory'

describe('buildPathTrajectory', () => {
  it('returns empty array for paths with fewer than 2 points', () => {
    expect(buildPathTrajectory({ points: [] })).toEqual([])
    expect(buildPathTrajectory({ points: [{ x: 0, y: 0 }] })).toEqual([])
  })

  it('with interval and default speed emits points at expected times', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      interval: 200,
      offset: 0,
    })
    expect(samples.length).toBeGreaterThan(0)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].time).toBeGreaterThan(samples[i - 1].time)
    }
  })

  it('time = distance / speed for interval mode', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      interval: 1000,
      offset: 0,
    })
    expect(samples.length).toBeGreaterThanOrEqual(2)
    const last = samples[samples.length - 1]
    const totalLenM = 1000 / 16.67
    expect(last.time).toBeCloseTo(totalLenM / DEFAULT_PATH_SPEED_MPS, 1)
  })

  it('uses tValues when provided and distributes them across totalDuration', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      tValues: [0, 0.25, 0.5, 0.75, 1.0],
    })
    expect(samples.length).toBe(5)
    const totalLenM = 1000 / 16.67
    const totalDuration = totalLenM / DEFAULT_PATH_SPEED_MPS
    const dt = totalDuration / 4
    expect(samples[0].time).toBeCloseTo(0, 3)
    expect(samples[1].time).toBeCloseTo(dt, 2)
    expect(samples[4].time).toBeCloseTo(totalDuration, 1)
    expect(samples[0].x).toBeCloseTo(0, 1)
    expect(samples[2].x).toBeCloseTo(totalLenM / 2, 1)
    expect(samples[4].x).toBeCloseTo(totalLenM, 1)
  })

  it('inverts y axis from canvas (down +) to ENU (up +)', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 100 }, { x: 1000, y: 100 }],
      tValues: [0, 1.0],
    })
    expect(samples[0].y).toBeCloseTo(-6, 1)
    expect(samples[1].y).toBeCloseTo(-6, 1)
  })

  it('heading is 0 (east) for path going +X', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      tValues: [0, 1.0],
    })
    expect(samples[0].heading).toBeCloseTo(0, 3)
  })

  it('heading is π/2 (north) for path going -Y on canvas (screen up)', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 100 }, { x: 0, y: 0 }],
      tValues: [0, 1.0],
    })
    expect(samples[0].heading).toBeCloseTo(Math.PI / 2, 3)
  })

  it('falls back to control points when no footprint info', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }],
    })
    expect(samples.length).toBe(3)
    expect(samples[0].time).toBeCloseTo(0, 3)
    const totalLenM = 1000 / 16.67
    expect(samples[2].time).toBeCloseTo(totalLenM / DEFAULT_PATH_SPEED_MPS, 1)
  })

  it('time monotonically increases even with zero-length segments', () => {
    const samples = buildPathTrajectory({
      points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }],
      tValues: [0, 0, 1.0],
    })
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].time).toBeGreaterThan(samples[i - 1].time)
    }
  })
})
