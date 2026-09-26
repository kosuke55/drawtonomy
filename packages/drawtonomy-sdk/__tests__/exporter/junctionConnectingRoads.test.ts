// Drawn roads between a branch and a merge (intersection turn lanes) are
// emitted as the junction's connecting roads themselves.
//
// They used to come out as mainlines with a 5 mm stub at each end, both stubs
// in one junction, so the turn road's predecessor AND successor named the same
// junction — whose connection table also listed the stub ending ON the turn
// road. With a route assigned, esmini picked that stub at the turn road's end,
// traversed it backwards and teleported the vehicle onto the incoming road,
// facing the wrong way.

import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml, type OdrRoad } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { evalGeometry } from '../../src/exporter/odrGeometry'
import type { DrawtonomySnapshot } from '../../src/types'

const point = (id: string, x: number, y: number) => ({
  id, type: 'point', x, y, rotation: 0, zIndex: 0,
  props: { color: 'black', visible: true, osmId: '' },
})
const linestring = (id: string, pointIds: string[]) => ({
  id, type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0,
  props: { pointIds, color: 'black', strokeWidth: 2, attributes: {}, osmId: '' },
})
const lane = (id: string, left: string, right: string, next: string[], prev: string[]) => ({
  id, type: 'lane', x: 0, y: 0, rotation: 0, zIndex: 0,
  props: {
    leftBoundaryId: left, rightBoundaryId: right, invertLeft: false, invertRight: false,
    color: 'default', size: 'm', attributes: { type: 'lanelet', subtype: 'road' },
    next, prev, osmId: '',
  },
})

/** A lane whose boundaries are the given polylines (canvas px, travel order). */
function laneOf(
  shapes: unknown[],
  id: string,
  left: [number, number][],
  right: [number, number][],
  next: string[],
  prev: string[]
): void {
  const ids = (side: string, pts: [number, number][]) =>
    pts.map(([x, y], i) => {
      shapes.push(point(`${id}${side}${i}`, x, y))
      return `${id}${side}${i}`
    })
  shapes.push(linestring(`${id}L`, ids('l', left)), linestring(`${id}R`, ids('r', right)))
  shapes.push(lane(id, `${id}L`, `${id}R`, next, prev))
}

/**
 * Cubic Bezier from p0 to p3, sampled uniformly in its parameter (canvas px).
 * Its curvature varies toward the tips, like the turn lanes an intersection
 * template draws: a tip tangent estimated from these samples is off by a
 * fraction of a degree.
 */
function bezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number]
): [number, number][] {
  const n = 12
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
    return [
      w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
      w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
    ] as [number, number]
  })
}

/**
 * Two approaches and two exits: A (eastbound) and D (southbound) each branch
 * into a straight lane and a turn; B (east exit) and C (south exit) each take
 * one lane from each approach. Lanes are 60 px wide.
 */
function crossing(): DrawtonomySnapshot {
  const shapes: unknown[] = []
  laneOf(shapes, 'A', [[0, -30], [300, -30]], [[0, 30], [300, 30]], ['S', 'T'], [])
  laneOf(shapes, 'D', [[530, -400], [530, -130]], [[470, -400], [470, -130]], ['U', 'V'], [])
  laneOf(shapes, 'S', [[300, -30], [630, -30]], [[300, 30], [630, 30]], ['B'], ['A'])
  // Right turn A -> C, leaving east and arriving south.
  laneOf(
    shapes, 'T',
    bezier([300, -30], [430, -30], [530, 70], [530, 200]),
    bezier([300, 30], [390, 30], [470, 110], [470, 200]),
    ['C'], ['A']
  )
  // Left turn D -> B, leaving south and arriving east.
  laneOf(
    shapes, 'U',
    bezier([530, -130], [530, -80], [580, -30], [630, -30]),
    bezier([470, -130], [470, -40], [540, 30], [630, 30]),
    ['B'], ['D']
  )
  laneOf(shapes, 'V', [[530, -130], [530, 200]], [[470, -130], [470, 200]], ['C'], ['D'])
  laneOf(shapes, 'B', [[630, -30], [900, -30]], [[630, 30], [900, 30]], [], ['S', 'U'])
  laneOf(shapes, 'C', [[530, 200], [530, 500]], [[470, 200], [470, 500]], [], ['T', 'V'])
  return {
    version: '1.1',
    timestamp: 't',
    shapes: shapes as DrawtonomySnapshot['shapes'],
    origin: { lat: 35, lon: 139 },
  }
}

const tipPose = (road: OdrRoad, end: 'start' | 'end') => {
  const g = end === 'start' ? road.planView[0] : road.planView[road.planView.length - 1]
  return evalGeometry(g, end === 'start' ? 0 : g.length)
}

describe('drawn junction connecting roads', () => {
  const xml = exportToOpenDrive(crossing())
  const parsed = parseOpenDriveXml(xml)
  const byId = new Map(parsed.roads.map(r => [r.id, r]))
  const junctionRoads = parsed.roads.filter(r => r.junction !== '-1')

  it('stamps the four turn / straight lanes with one junction, no stubs', () => {
    expect(parsed.junctions).toHaveLength(1)
    expect(junctionRoads).toHaveLength(4)
    expect(parsed.roads.some(r => r.name === 'connecting')).toBe(false)
    const junction = parsed.junctions[0]
    expect(junction.connections).toHaveLength(4)
    for (const conn of junction.connections) {
      const road = byId.get(conn.connectingRoad)!
      expect(road.junction).toBe(junction.id)
      expect(road.predecessor).toMatchObject({ elementType: 'road', elementId: conn.incomingRoad, contactPoint: 'end' })
      expect(road.successor?.elementType).toBe('road')
      expect(road.successor?.contactPoint).toBe('start')
      expect(byId.get(road.successor!.elementId)?.junction).toBe('-1')
    }
  })

  it('never links a road to the same junction at both ends', () => {
    for (const road of parsed.roads) {
      if (road.predecessor?.elementType !== 'junction') continue
      expect(road.successor?.elementType === 'junction' && road.successor.elementId === road.predecessor.elementId).toBe(false)
    }
  })

  it('meets the neighbouring roads with the same position and heading', () => {
    // The contact cross-section is shared: a heading step of dh would open a
    // gap of t*dh at the lane's outer border.
    for (const road of junctionRoads) {
      const inc = byId.get(road.predecessor!.elementId)!
      const out = byId.get(road.successor!.elementId)!
      for (const [a, b] of [
        [tipPose(inc, 'end'), tipPose(road, 'start')],
        [tipPose(road, 'end'), tipPose(out, 'start')],
      ]) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.005)
        expect(Math.abs(Math.atan2(Math.sin(a.hdg - b.hdg), Math.cos(a.hdg - b.hdg)))).toBeLessThan(1e-3)
      }
    }
  })

  it('re-imports with the same lanes and connections', () => {
    const after = odrToShapes(parseOpenDriveXml(xml))
    expect(after.lanes).toHaveLength(8)
    const edges = after.lanes.reduce((n, l) => n + (l.next?.length ?? 0), 0)
    expect(edges).toBe(8)
  })
})
