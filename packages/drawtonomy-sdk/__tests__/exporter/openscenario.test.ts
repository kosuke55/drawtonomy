import { describe, it, expect } from 'vitest'
import {
  exportToOpenScenario,
  templateIdToVehicleCategory,
} from '../../src/exporter/openscenario'
import type { DrawtonomySnapshot } from '../../src/types'

function snapshot(shapes: any[]): DrawtonomySnapshot {
  return { version: '1.1', timestamp: new Date().toISOString(), shapes }
}

function vehicle(id: string, props: Partial<any> = {}, x = 0, y = 0, rotation = 0) {
  return {
    id,
    type: 'vehicle',
    x,
    y,
    rotation,
    zIndex: 0,
    props: {
      w: 90,
      h: 45,
      color: 'black',
      size: 'm',
      attributes: {},
      osmId: '',
      templateId: 'sedan',
      ...props,
    },
  }
}

describe('templateIdToVehicleCategory', () => {
  it('maps vehicle templates to OpenSCENARIO categories', () => {
    expect(templateIdToVehicleCategory('sedan')).toBe('car')
    expect(templateIdToVehicleCategory('bus')).toBe('bus')
    expect(templateIdToVehicleCategory('truck')).toBe('truck')
    expect(templateIdToVehicleCategory('motorcycle')).toBe('motorbike')
    expect(templateIdToVehicleCategory('motorcycle2')).toBe('motorbike')
    expect(templateIdToVehicleCategory('bicycle')).toBe('bicycle')
    expect(templateIdToVehicleCategory('bicycle2')).toBe('bicycle')
  })

  it('falls back to car for non-standard templates', () => {
    expect(templateIdToVehicleCategory('amr')).toBe('car')
    expect(templateIdToVehicleCategory('robovac')).toBe('car')
    expect(templateIdToVehicleCategory('totally-unknown')).toBe('car')
  })
})

describe('exportToOpenScenario', () => {
  it('emits a valid OpenSCENARIO 1.3 header even with no entities', () => {
    const xml = exportToOpenScenario(snapshot([]))
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`)
    expect(xml).toContain(`<OpenSCENARIO>`)
    expect(xml).toContain(`revMajor="1"`)
    expect(xml).toContain(`revMinor="3"`)
    expect(xml).toContain(`<RoadNetwork>`)
    expect(xml).toContain(`<Entities>`)
    expect(xml).toContain(`<Storyboard>`)
    expect(xml).toContain(`</OpenSCENARIO>`)
  })

  it('references the provided xodr file in LogicFile', () => {
    const xml = exportToOpenScenario(snapshot([]), { xodrFilename: 'my-scene.xodr' })
    expect(xml).toContain(`<LogicFile filepath="my-scene.xodr"/>`)
  })

  it('emits a Vehicle ScenarioObject for sedan template with BoundingBox', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'sedan', w: 90, h: 45 }, 100, 200),
    ]))
    expect(xml).toContain(`<ScenarioObject name="Vehicle_0">`)
    expect(xml).toContain(`vehicleCategory="car"`)
    expect(xml).toContain(`<BoundingBox>`)
    expect(xml).toMatch(/<Dimensions width="\d+\.\d+" length="\d+\.\d+" height="\d+\.\d+"\/>/)
    expect(xml).toContain(`<Performance `)
    expect(xml).toContain(`<Axles>`)
    expect(xml).toContain(`<Property name="scaleMode" value="ModelToBB"/>`)
  })

  it('uses vehicleCategory bus for bus template', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'bus' }),
    ]))
    expect(xml).toContain(`vehicleCategory="bus"`)
  })

  it('emits a Pedestrian element for pedestrian templates', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('p1', { templateId: 'pedestrian' }),
    ]))
    expect(xml).toContain(`<Pedestrian `)
    expect(xml).toContain(`pedestrianCategory="pedestrian"`)
    expect(xml).not.toMatch(/<Vehicle [^>]*pedestrianCategory/)
  })

  it('emits TeleportAction with WorldPosition for each entity', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'sedan' }, 100, 200),
      vehicle('p1', { templateId: 'pedestrian' }, 300, 400),
    ]))
    const teleports = xml.match(/<TeleportAction>/g) || []
    expect(teleports.length).toBe(2)
    expect(xml).toContain(`<Private entityRef="Vehicle_0">`)
    expect(xml).toContain(`<Private entityRef="Pedestrian_1">`)
  })

  it('converts pixel coordinates to meters and inverts y axis', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'sedan' }, 100, 200),
    ]))
    const m = xml.match(/<WorldPosition x="([\d.\-]+)" y="([\d.\-]+)"/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeCloseTo(6.0, 0)
    expect(parseFloat(m![2])).toBeCloseTo(-12.0, 0)
  })

  it('converts rotation degrees to ENU heading with π/2 offset (template faces -Y)', () => {
    const xmlZero = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'sedan' }, 0, 0, 0),
    ]))
    const m0 = xmlZero.match(/<WorldPosition [^/]*h="([\d.\-]+)"/)
    expect(m0).not.toBeNull()
    expect(parseFloat(m0![1])).toBeCloseTo(Math.PI / 2, 3)

    const xml90 = exportToOpenScenario(snapshot([
      vehicle('v2', { templateId: 'sedan' }, 0, 0, 90),
    ]))
    const m90 = xml90.match(/<WorldPosition [^/]*h="([\d.\-]+)"/)
    expect(m90).not.toBeNull()
    expect(parseFloat(m90![1])).toBeCloseTo(0, 3)
  })

  it('produces vehicle dimensions matching px-to-m conversion', () => {
    const xml = exportToOpenScenario(snapshot([
      vehicle('v1', { templateId: 'sedan', w: 100, h: 50 }),
    ]))
    const m = xml.match(/<Dimensions width="([\d.]+)" length="([\d.]+)"/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeCloseTo(6.0, 1)
    expect(parseFloat(m![2])).toBeCloseTo(3.0, 1)
  })

  it('emits a StopTrigger so the simulation does not run forever', () => {
    const xml = exportToOpenScenario(snapshot([]))
    expect(xml).toContain(`<StopTrigger>`)
    expect(xml).toContain(`<SimulationTimeCondition `)
  })

  it('emits FollowTrajectoryAction for path with footprint vehicles', () => {
    const v = vehicle('v1', { templateId: 'sedan' }, 100, 200)
    const path = {
      id: 'p1',
      type: 'linestring',
      x: 0, y: 0, rotation: 0, zIndex: 0,
      props: {
        pointIds: ['pt1', 'pt2', 'pt3'],
        color: 'black',
        strokeWidth: 2,
        attributes: {},
        osmId: '',
        isPath: true,
        footprint: { interval: 200, offset: 0, templateId: 'sedan' },
        footprintIds: [v.id],
      },
    }
    const pt1 = { id: 'pt1', type: 'point', x: 0, y: 0, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const pt2 = { id: 'pt2', type: 'point', x: 500, y: 0, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const pt3 = { id: 'pt3', type: 'point', x: 1000, y: 0, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const xml = exportToOpenScenario(snapshot([v, path, pt1, pt2, pt3]))
    expect(xml).toContain(`<Story name="MovingStory">`)
    expect(xml).toContain(`<FollowTrajectoryAction>`)
    expect(xml).toContain(`<Trajectory `)
    expect(xml).toContain(`<Polyline>`)
    expect(xml).toContain(`<EntityRef entityRef="Vehicle_0"/>`)
  })

  it('skips follower footprint vehicles, only head is exported as ScenarioObject', () => {
    const head = vehicle('vh', { templateId: 'sedan' }, 100, 100)
    const f1 = vehicle('vf1', { templateId: 'sedan' }, 200, 100)
    const f2 = vehicle('vf2', { templateId: 'sedan' }, 300, 100)
    const path = {
      id: 'p1', type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0,
      props: {
        pointIds: ['pt1', 'pt2'],
        color: 'black', strokeWidth: 2, attributes: {}, osmId: '',
        isPath: true,
        footprint: { interval: 100, offset: 0, templateId: 'sedan' },
        footprintIds: [head.id, f1.id, f2.id],
      },
    }
    const pt1 = { id: 'pt1', type: 'point', x: 0, y: 100, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const pt2 = { id: 'pt2', type: 'point', x: 500, y: 100, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const xml = exportToOpenScenario(snapshot([head, f1, f2, path, pt1, pt2]))
    const objCount = (xml.match(/<ScenarioObject /g) || []).length
    expect(objCount).toBe(1)
    expect(xml).toContain(`<ScenarioObject name="Vehicle_0">`)
    expect(xml).not.toContain(`Vehicle_1`)
    expect(xml).not.toContain(`Vehicle_2`)
  })

  it('aligns Init TeleportAction to path start when entity is on a trajectory', () => {
    const v = vehicle('v1', { templateId: 'sedan' }, 0, 0)
    const path = {
      id: 'p1', type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0,
      props: {
        pointIds: ['pt1', 'pt2'],
        color: 'black', strokeWidth: 2, attributes: {}, osmId: '',
        isPath: true,
        footprint: { interval: 200, offset: 0, templateId: 'sedan' },
        footprintIds: [v.id],
      },
    }
    const pt1 = { id: 'pt1', type: 'point', x: 500, y: 0, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const pt2 = { id: 'pt2', type: 'point', x: 1000, y: 0, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
    const xml = exportToOpenScenario(snapshot([v, path, pt1, pt2]))
    const initBlockMatch = xml.match(/<Init>([\s\S]*?)<\/Init>/)
    expect(initBlockMatch).not.toBeNull()
    const initBlock = initBlockMatch![1]
    expect(initBlock).toContain(`x="29.994001"`)
  })
})
