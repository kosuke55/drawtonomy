import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToLanelet2 } from '../../src/exporter/lanelet2'
import type { DrawtonomySnapshot } from '../../src/types'

// Downstream-consumer (e.g. Autoware / lanelet2 extension) format requirements:
//   - every <node> carries an `ele` tag
//   - the traffic light `refers` way carries subtype and height
//   - lanelets inside an intersection carry a turn_direction tag

function shapesToSnapshot(imp: ReturnType<typeof odrToShapes>): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of imp.points) {
    shapes.push({ id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: p.osmId } })
  }
  for (const ls of imp.linestrings) {
    shapes.push({ id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0, props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId } })
  }
  for (const lane of imp.lanes) {
    shapes.push({ id: lane.id, type: 'lane', x: lane.x, y: lane.y, rotation: 0, zIndex: 0, props: { leftBoundaryId: lane.leftBoundaryId, rightBoundaryId: lane.rightBoundaryId, invertLeft: lane.invertLeft, invertRight: lane.invertRight, color: 'default', size: 'm', attributes: lane.attributes, next: lane.next, prev: lane.prev, osmId: lane.osmId } })
  }
  for (const tl of imp.trafficLights ?? []) {
    shapes.push({ id: tl.id, type: 'traffic_light', x: tl.x, y: tl.y, rotation: 0, zIndex: 0, props: { w: tl.w, h: tl.h, color: 'black', style: 'traffic', attributes: tl.attributes ?? {}, osmId: tl.osmId ?? '', affectedLaneIds: tl.affectedLaneIds, stopLineId: tl.stopLineId ?? null } })
  }
  return { version: '1.1', timestamp: new Date().toISOString(), shapes: shapes as DrawtonomySnapshot['shapes'] }
}

describe('Autoware format requirements', () => {
  const fixturePath = join(__dirname, '..', 'fixtures', 'fabriksgatan.xodr')
  const xml = readFileSync(fixturePath, 'utf-8')

  it('every exported node carries an ele tag', () => {
    const imp = odrToShapes(parseOpenDriveXml(xml))
    const osm = exportToLanelet2(shapesToSnapshot(imp), { mapOrigin: { lat: 57.77, lon: 12.78 } })
    const nodeCount = (osm.match(/<node /g) ?? []).length
    const eleCount = (osm.match(/<tag k='ele'/g) ?? []).length
    expect(nodeCount).toBeGreaterThan(100)
    expect(eleCount).toBe(nodeCount)
  })

  it('traffic light refers ways carry subtype and height', () => {
    const tlXml = readFileSync(join(__dirname, '..', 'fixtures', 'fabriksgatan.xodr'), 'utf-8')
      // Synthesize a signal so the export path runs even on the plain fixture.
      .replace('<signals/>', '')
    const imp = odrToShapes(parseOpenDriveXml(tlXml))
    // Attach a synthetic traffic light controlling the first lane.
    const lane = imp.lanes[0]
    imp.trafficLights = [{
      id: 'shape:traffic_light_1',
      x: lane.x,
      y: lane.y,
      w: 30,
      h: 60,
      osmId: '',
      affectedLaneIds: [lane.id],
      stopLineId: null,
      attributes: {},
    }]
    const osm = exportToLanelet2(shapesToSnapshot(imp), { mapOrigin: { lat: 57.77, lon: 12.78 } })
    const refersWay = osm.match(/<way[^>]*>(?:(?!<\/way>)[\s\S])*?k='type' v='traffic_light'[\s\S]*?<\/way>/)
    expect(refersWay).not.toBeNull()
    expect(refersWay![0]).toContain("k='subtype' v='red_yellow_green'")
    expect(refersWay![0]).toContain("k='height' v='0.5'")
  })

  it('junction lanes carry a turn_direction tag with valid values', () => {
    const imp = odrToShapes(parseOpenDriveXml(xml))
    const junctionLanes = imp.lanes.filter(l => l.attributes.odr_junction_id)
    expect(junctionLanes.length).toBeGreaterThan(5)
    for (const lane of junctionLanes) {
      expect(['left', 'right', 'straight']).toContain(lane.attributes.turn_direction)
    }
    const dirs = new Set(junctionLanes.map(l => l.attributes.turn_direction))
    // fabriksgatan's junction has both turning and straight connections.
    expect(dirs.has('left') || dirs.has('right')).toBe(true)
    expect(dirs.has('straight')).toBe(true)
  })

  it('non-junction lanes do not get a synthetic turn_direction', () => {
    const imp = odrToShapes(parseOpenDriveXml(xml))
    for (const lane of imp.lanes) {
      if (!lane.attributes.odr_junction_id) {
        expect(lane.attributes.turn_direction).toBeUndefined()
      }
    }
  })
})
