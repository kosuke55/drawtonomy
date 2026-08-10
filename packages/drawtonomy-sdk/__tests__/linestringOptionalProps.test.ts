import { describe, it, expect } from 'vitest'
import {
  createLaneWithBoundaries,
  createLinestring,
  createPathWithFootprints,
  createPoint,
  createSnapshot,
} from '../src/helpers.js'
import { exportToOpenScenario } from '../src/exporter/openscenario.js'

/**
 * `createLinestring` accepts `Partial<LinestringProps>` but used to enumerate
 * only 5 of the 12 props when building the shape, silently discarding the rest
 * (isPath, arrowHead, arrowHeadSize, opacity, smooth, segments, footprint,
 * footprintIds). Callers got no type error, so the loss was invisible.
 *
 * The visible consequence was in `createPathWithFootprints`: it passes
 * `isPath: true`, that flag was dropped, and the OpenSCENARIO exporter — which
 * gates trajectory emission on `props.isPath` — skipped the path. Scenes built
 * from code therefore exported N parked cars instead of one car following a
 * trajectory, i.e. no animation could be authored headlessly at all.
 */
describe('createLinestring keeps optional props', () => {
  it('passes through every optional prop it is given', () => {
    const pts = [createPoint(0, 0), createPoint(100, 0)]
    const ls = createLinestring(0, 0, pts.map((p) => p.id), {
      isPath: true,
      arrowHead: 'end',
      arrowHeadSize: 15,
      opacity: 0.85,
      smooth: true,
      footprintIds: ['veh_1'],
      footprint: { interval: 50, offset: 0, templateId: 'sedan' },
    })

    expect(ls.props.isPath).toBe(true)
    expect(ls.props.arrowHead).toBe('end')
    expect(ls.props.arrowHeadSize).toBe(15)
    expect(ls.props.opacity).toBe(0.85)
    expect(ls.props.smooth).toBe(true)
    expect(ls.props.footprintIds).toEqual(['veh_1'])
    expect(ls.props.footprint?.templateId).toBe('sedan')
  })

  it('still applies defaults and never lets options override pointIds', () => {
    const pts = [createPoint(0, 0), createPoint(100, 0)]
    const ids = pts.map((p) => p.id)
    const ls = createLinestring(0, 0, ids, { pointIds: ['bogus'] })

    expect(ls.props.pointIds).toEqual(ids)
    expect(ls.props.color).toBe('black')
    expect(ls.props.strokeWidth).toBe(2)
    expect(ls.props.attributes).toEqual({ type: 'linestring', subtype: 'solid' })
    expect(ls.props.osmId).toBe('')
  })
})

describe('a headlessly built path becomes a followable trajectory', () => {
  it('emits one moving entity with a Polyline, not N parked cars', () => {
    const lane = createLaneWithBoundaries(
      [{ x: 0, y: 0 }, { x: 500, y: 0 }],
      [{ x: 0, y: 50 }, { x: 500, y: 50 }],
    )
    const path = createPathWithFootprints(
      [{ x: 0, y: 25 }, { x: 250, y: 25 }, { x: 500, y: 25 }],
      { count: 5 },
    )
    const xosc = exportToOpenScenario(createSnapshot([...lane, ...path]), {})

    // The follower footprints collapse into the leading entity.
    expect(xosc.match(/<ScenarioObject /g) ?? []).toHaveLength(1)
    expect(xosc).toContain('<FollowTrajectoryAction>')
    expect(xosc).toContain('<Polyline>')
    expect(xosc.match(/<Vertex /g) ?? []).toHaveLength(5)

    // Vertices carry timestamps and meter coordinates (500 px = ~30 m).
    const xs = [...xosc.matchAll(/<WorldPosition x="([-\d.]+)"/g)].map((m) => Number(m[1]))
    expect(Math.max(...xs)).toBeCloseTo(29.99, 1)
  })
})
