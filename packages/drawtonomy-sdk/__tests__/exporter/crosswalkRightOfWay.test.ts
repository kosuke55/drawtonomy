// Crosswalk / right-of-way regulatory element tests:
// Lanelet2 export/import round-trips and OpenDRIVE userData carry-through.

import { describe, it, expect } from 'vitest'
import { exportToLanelet2 } from '../../src/exporter/lanelet2'
import { parseOsmXml } from '../../src/exporter/osmParser'
import { osmToShapes, type ImportedShapes } from '../../src/exporter/osmToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'

function snapshot(shapes: any[]): DrawtonomySnapshot {
  return { version: '1.1', timestamp: new Date().toISOString(), shapes }
}

function point(id: string, x: number, y: number, osmId = '') {
  return { id, type: 'point', x, y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId } }
}

function linestring(id: string, pointIds: string[], osmId = '', attrs: Record<string, string> = {}) {
  return {
    id,
    type: 'linestring',
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    props: { pointIds, color: 'black', strokeWidth: 2, attributes: { type: 'line_thin', subtype: 'solid', ...attrs }, osmId },
  }
}

function lane(id: string, leftId: string, rightId: string, osmId = '', extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'lane',
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    props: {
      leftBoundaryId: leftId,
      rightBoundaryId: rightId,
      invertLeft: false,
      invertRight: false,
      color: 'default',
      size: 'm',
      attributes: { type: 'lanelet', subtype: 'road', speed_limit: '30' },
      next: [],
      prev: [],
      osmId,
      ...extra,
    },
  }
}

function crosswalk(id: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'crosswalk',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 100,
      crosswalkWidth: 20,
      color: 'white',
      attributes: {},
      osmId: '',
      ...extra,
    },
  }
}

/** Two parallel lanes: lane0 (y 0..50) and lane1 (y 100..150), x 0..200. */
function twoLaneShapes() {
  return [
    point('p0', 0, 0),
    point('p1', 200, 0),
    point('p2', 0, 50),
    point('p3', 200, 50),
    linestring('left0', ['p0', 'p1']),
    linestring('right0', ['p2', 'p3']),
    lane('lane0', 'left0', 'right0'),
    point('p4', 0, 100),
    point('p5', 200, 100),
    point('p6', 0, 150),
    point('p7', 200, 150),
    linestring('left1', ['p4', 'p5']),
    linestring('right1', ['p6', 'p7']),
    lane('lane1', 'left1', 'right1'),
  ]
}

/** lane0 plus a crosswalk band across it (axis x=100, y -10..60) and a stop line. */
function laneWithCrosswalkShapes() {
  return [
    point('p0', 0, 0),
    point('p1', 200, 0),
    point('p2', 0, 50),
    point('p3', 200, 50),
    linestring('left0', ['p0', 'p1']),
    linestring('right0', ['p2', 'p3']),
    lane('lane0', 'left0', 'right0'),
    point('ps0', 80, 2),
    point('ps1', 80, 48),
    linestring('stop0', ['ps0', 'ps1']),
    crosswalk('cw0', 0, 0, {
      startX: 100,
      startY: -10,
      endX: 100,
      endY: 60,
      crosswalkWidth: 20,
      affectedLaneIds: ['lane0'],
      stopLineId: 'stop0',
    }),
  ]
}

function rowLaneShapes() {
  const shapes = twoLaneShapes()
  const lane1 = shapes.find(s => s.id === 'lane1') as any
  lane1.props.yieldLaneIds = ['lane0']
  return shapes
}

/** Rebuild snapshot shapes from an import result, as the editor would. */
function shapesFromImport(imported: ImportedShapes): any[] {
  const shapes: any[] = []
  for (const p of imported.points) shapes.push(point(p.id, p.x, p.y, p.osmId))
  for (const ls of imported.linestrings) {
    const shape = linestring(ls.id, ls.pointIds, ls.osmId)
    shape.props.attributes = ls.attributes as any
    shapes.push(shape)
  }
  for (const l of imported.lanes) {
    const shape = lane(l.id, l.leftBoundaryId, l.rightBoundaryId, l.osmId)
    shape.props.attributes = l.attributes as any
    if (l.yieldLaneIds) (shape.props as any).yieldLaneIds = l.yieldLaneIds
    shapes.push(shape)
  }
  for (const cw of imported.crosswalks) {
    shapes.push(
      crosswalk(cw.id, cw.x, cw.y, {
        startX: cw.startX,
        startY: cw.startY,
        endX: cw.endX,
        endY: cw.endY,
        crosswalkWidth: cw.crosswalkWidth,
        osmId: cw.osmId,
        attributes: cw.attributes,
        affectedLaneIds: cw.affectedLaneIds,
        stopLineId: cw.stopLineId,
      })
    )
  }
  return shapes
}

describe('exportToLanelet2 right_of_way', () => {
  it('emits a right_of_way regulatory element with right_of_way / yield members', () => {
    const xml = exportToLanelet2(snapshot(rowLaneShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.subtype === 'right_of_way')
    expect(re).toBeDefined()
    expect(re!.tags.type).toBe('regulatory_element')

    const lanelets = data.relations.filter(r => r.tags.type === 'lanelet')
    expect(lanelets).toHaveLength(2)
    // lane1 (the second lanelet) holds the right of way; lane0 yields.
    const rowMember = re!.members.find(m => m.role === 'right_of_way')
    const yieldMembers = re!.members.filter(m => m.role === 'yield')
    expect(rowMember?.type).toBe('relation')
    expect(yieldMembers).toHaveLength(1)
    expect(rowMember!.ref).not.toBe(yieldMembers[0].ref)

    // The right_of_way lanelet references the regulatory element back.
    const rowLanelet = lanelets.find(l => l.id === rowMember!.ref)!
    expect(rowLanelet.members).toContainEqual({ type: 'relation', ref: re!.id, role: 'regulatory_element' })
    // The yield lanelet is referenced via the yield role only.
    const yieldLanelet = lanelets.find(l => l.id === yieldMembers[0].ref)!
    expect(yieldLanelet.members.some(m => m.role === 'regulatory_element' && m.ref === re!.id)).toBe(false)
  })

  it('skips lanes whose yieldLaneIds resolve to nothing', () => {
    const shapes = twoLaneShapes()
    const lane1 = shapes.find(s => s.id === 'lane1') as any
    lane1.props.yieldLaneIds = ['lane_deleted']
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    expect(data.relations.some(r => r.tags.subtype === 'right_of_way')).toBe(false)
  })

  it('round-trips yieldLaneIds through export -> import', () => {
    const xml = exportToLanelet2(snapshot(rowLaneShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const result = osmToShapes(parseOsmXml(xml))

    expect(result.lanes).toHaveLength(2)
    const rowLanes = result.lanes.filter(l => (l.yieldLaneIds ?? []).length > 0)
    expect(rowLanes).toHaveLength(1)
    const other = result.lanes.find(l => l.id !== rowLanes[0].id)!
    expect(rowLanes[0].yieldLaneIds).toEqual([other.id])
  })

  it('overrides the sidecar right_of_way element on re-export instead of duplicating it', () => {
    const firstXml = exportToLanelet2(snapshot(rowLaneShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const firstRe = parseOsmXml(firstXml).relations.find(r => r.tags.subtype === 'right_of_way')!
    const imported = osmToShapes(parseOsmXml(firstXml))

    const secondXml = exportToLanelet2(snapshot(shapesFromImport(imported)), {
      sidecar: { rawXml: firstXml, originLat: 35, originLon: 139 },
    })
    const data = parseOsmXml(secondXml)
    const res = data.relations.filter(r => r.tags.subtype === 'right_of_way')
    expect(res).toHaveLength(1)
    // Same relation id as the first export (overridden in place).
    expect(res[0].id).toBe(firstRe.id)
  })
})

describe('exportToLanelet2 crosswalk', () => {
  it('emits a crosswalk lanelet, polygon way and regulatory element', () => {
    const xml = exportToLanelet2(snapshot(laneWithCrosswalkShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.subtype === 'crosswalk' && r.tags.type === 'regulatory_element')
    expect(re).toBeDefined()

    // refers: a synthesized lanelet with subtype=crosswalk.
    const refers = re!.members.find(m => m.role === 'refers')
    expect(refers?.type).toBe('relation')
    const cwLanelet = data.relations.find(r => r.id === refers!.ref)!
    expect(cwLanelet.tags.type).toBe('lanelet')
    expect(cwLanelet.tags.subtype).toBe('crosswalk')
    const leftWay = data.ways.get(cwLanelet.members.find(m => m.role === 'left')!.ref)!
    const rightWay = data.ways.get(cwLanelet.members.find(m => m.role === 'right')!.ref)!
    expect(leftWay.nodeRefs).toHaveLength(2)
    expect(rightWay.nodeRefs).toHaveLength(2)

    // crosswalk_polygon: closed ring over the four band corners.
    const polygonMember = re!.members.find(m => m.role === 'crosswalk_polygon')
    expect(polygonMember?.type).toBe('way')
    const polygonWay = data.ways.get(polygonMember!.ref)!
    expect(polygonWay.tags.type).toBe('crosswalk_polygon')
    expect(polygonWay.tags.area).toBe('yes')
    expect(polygonWay.nodeRefs).toHaveLength(5)
    expect(polygonWay.nodeRefs[0]).toBe(polygonWay.nodeRefs[4])

    // ref_line: the stop line way is forced to type=stop_line.
    const refLine = re!.members.find(m => m.role === 'ref_line')
    expect(refLine?.type).toBe('way')
    expect(data.ways.get(refLine!.ref)?.tags.type).toBe('stop_line')

    // The affected (driving) lanelet references the regulatory element back.
    const driving = data.relations.find(r => r.tags.type === 'lanelet' && r.tags.subtype === 'road')!
    expect(driving.members).toContainEqual({ type: 'relation', ref: re!.id, role: 'regulatory_element' })
  })

  it('skips crosswalks without affectedLaneIds', () => {
    const shapes = laneWithCrosswalkShapes()
    const cw = shapes.find(s => s.id === 'cw0') as any
    delete cw.props.affectedLaneIds
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    expect(data.relations.some(r => r.tags.subtype === 'crosswalk')).toBe(false)
  })

  it('skips crosswalks whose affectedLaneIds all resolve to nothing (deleted lanes)', () => {
    const shapes = laneWithCrosswalkShapes()
    const cw = shapes.find(s => s.id === 'cw0') as any
    cw.props.affectedLaneIds = ['lane_deleted']
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    // No orphan regulatory element / synthesized crosswalk lanelet is emitted.
    expect(data.relations.some(r => r.tags.subtype === 'crosswalk')).toBe(false)
    expect([...data.ways.values()].some(w => w.tags.type === 'crosswalk_polygon')).toBe(false)
  })

  it('round-trips affectedLaneIds / stopLineId / band geometry through Lanelet2', () => {
    const xml = exportToLanelet2(snapshot(laneWithCrosswalkShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const result = osmToShapes(parseOsmXml(xml))

    // The crosswalk lanelet is consumed into the shape — only the driving
    // lanelet materializes as a lane (no duplication).
    expect(result.lanes).toHaveLength(1)
    expect(result.crosswalks).toHaveLength(1)
    const cw = result.crosswalks[0]

    // Band axis / width come back (origin embedded -> exact page coordinates).
    expect(cw.x + cw.startX).toBeCloseTo(100, 3)
    expect(cw.y + cw.startY).toBeCloseTo(-10, 3)
    expect(cw.x + cw.endX).toBeCloseTo(100, 3)
    expect(cw.y + cw.endY).toBeCloseTo(60, 3)
    expect(cw.crosswalkWidth).toBeCloseTo(20, 3)

    expect(cw.affectedLaneIds).toEqual([result.lanes[0].id])

    expect(cw.stopLineId).not.toBeNull()
    const stopLs = result.linestrings.find(ls => ls.id === cw.stopLineId)!
    expect(stopLs.attributes.type).toBe('stop_line')

    // Round-trip bookkeeping: relation / consumed way OSM ids are retained.
    const data = parseOsmXml(xml)
    const re = data.relations.find(r => r.tags.subtype === 'crosswalk' && r.tags.type === 'regulatory_element')!
    expect(cw.osmId).toBe(re.id)
    expect(cw.attributes.crosswalk_lanelet_osm_id).toBe(re.members.find(m => m.role === 'refers')!.ref)
    expect(cw.attributes.crosswalk_polygon_osm_id).toBe(re.members.find(m => m.role === 'crosswalk_polygon')!.ref)
  })

  it('restricts crosswalk elements to the selected lanelets', () => {
    const xml = exportToLanelet2(snapshot(laneWithCrosswalkShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    const drivingId = data.relations.find(r => r.tags.type === 'lanelet' && r.tags.subtype === 'road')!.id
    const none = osmToShapes(data, { selectedLaneIds: ['does-not-exist'] })
    expect(none.crosswalks).toHaveLength(0)
    const some = osmToShapes(data, { selectedLaneIds: [drivingId] })
    expect(some.crosswalks).toHaveLength(1)
  })

  it('overrides the sidecar crosswalk entities on re-export instead of duplicating them', () => {
    const firstXml = exportToLanelet2(snapshot(laneWithCrosswalkShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const firstData = parseOsmXml(firstXml)
    const imported = osmToShapes(firstData)

    const secondXml = exportToLanelet2(snapshot(shapesFromImport(imported)), {
      sidecar: { rawXml: firstXml, originLat: 35, originLon: 139 },
    })
    const data = parseOsmXml(secondXml)
    expect(data.relations.filter(r => r.tags.subtype === 'crosswalk' && r.tags.type === 'regulatory_element')).toHaveLength(1)
    expect(data.relations.filter(r => r.tags.subtype === 'crosswalk' && r.tags.type === 'lanelet')).toHaveLength(1)
    expect([...data.ways.values()].filter(w => w.tags.type === 'crosswalk_polygon')).toHaveLength(1)
    // Entity counts are stable across the round trip (nothing duplicated).
    expect(data.relations).toHaveLength(firstData.relations.length)
    expect(data.ways.size).toBe(firstData.ways.size)
    expect(data.nodes.size).toBe(firstData.nodes.size)
  })
})

describe('exportToOpenDrive regulatory carry-through', () => {
  it('stashes yieldLaneIds as <userData code="yieldLanes"> and restores them on import', () => {
    const xml = exportToOpenDrive(snapshot(rowLaneShapes()))
    expect(xml).toContain('<userData code="yieldLanes"')

    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.lanes).toHaveLength(2)
    const rowLanes = result.lanes.filter(l => (l.yieldLaneIds ?? []).length > 0)
    expect(rowLanes).toHaveLength(1)
    const other = result.lanes.find(l => l.id !== rowLanes[0].id)!
    expect(rowLanes[0].yieldLaneIds).toEqual([other.id])
  })

  it('stashes crosswalk links as <userData code="crosswalkLinks"> and restores them on import', () => {
    const xml = exportToOpenDrive(snapshot(laneWithCrosswalkShapes()))
    expect(xml).toContain('<userData code="crosswalkLinks"')

    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.lanes).toHaveLength(1)
    expect(result.crosswalks).toHaveLength(1)
    const cw = result.crosswalks[0]
    expect(cw.affectedLaneIds).toEqual([result.lanes[0].id])

    // Stop line rebuilt from the embedded polyline and linked back.
    expect(cw.stopLineId).not.toBeNull()
    const stopLs = result.linestrings.find(ls => ls.id === cw.stopLineId)!
    expect(stopLs.attributes.type).toBe('stop_line')

    // Band size survives; the axis crosses the road (perpendicular band).
    const axisLen = Math.hypot(cw.endX - cw.startX, cw.endY - cw.startY)
    expect(axisLen).toBeCloseTo(70, 3)
    expect(cw.crosswalkWidth).toBeCloseTo(20, 3)
    // The band center stays put: x = 100 px (s = 6 m on the road), y = 25 px.
    expect(cw.x).toBeCloseTo(100, 0)
    expect(cw.y).toBeCloseTo(25, 0)
    expect(cw.attributes.odr_road_id).toBeDefined()
    expect(cw.crosswalkWidth / PIXELS_PER_METER).toBeCloseTo(1.2, 3)
  })

  it('keeps a plain crosswalk (no links) silently attached without userData', () => {
    const shapes = laneWithCrosswalkShapes()
    const cw = shapes.find(s => s.id === 'cw0') as any
    delete cw.props.affectedLaneIds
    delete cw.props.stopLineId
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain('type="crosswalk"')
    expect(xml).not.toContain('crosswalkLinks')

    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.crosswalks).toHaveLength(1)
    expect(result.crosswalks[0].affectedLaneIds).toEqual([])
    expect(result.crosswalks[0].stopLineId).toBeNull()
  })
})
