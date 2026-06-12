// Regulatory layer (traffic light -> lane association) tests:
// Lanelet2 regulatory_element export/import and OpenDRIVE signal validity.

import { describe, it, expect } from 'vitest'
import { exportToLanelet2 } from '../../src/exporter/lanelet2'
import { parseOsmXml } from '../../src/exporter/osmParser'
import { osmToShapes } from '../../src/exporter/osmToShapes'
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

function lane(id: string, leftId: string, rightId: string, osmId = '') {
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
    },
  }
}

function trafficLight(id: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'traffic_light',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w: 30,
      h: 60,
      color: 'black',
      style: 'traffic_red',
      activeLight: 'all',
      size: 'm',
      attributes: {},
      osmId: '',
      ...extra,
    },
  }
}

/** A single lane (x: 0..100), a vertical stop line at x=100, and a signal. */
function laneWithSignalShapes() {
  return [
    point('p0', 0, 0),
    point('p1', 100, 0),
    point('p2', 0, 50),
    point('p3', 100, 50),
    linestring('left', ['p0', 'p1']),
    linestring('right', ['p2', 'p3']),
    lane('lane0', 'left', 'right'),
    point('ps0', 100, 2),
    point('ps1', 100, 48),
    linestring('stop0', ['ps0', 'ps1']),
    trafficLight('tl0', 100, -40, { affectedLaneIds: ['lane0'], stopLineId: 'stop0' }),
  ]
}

describe('exportToLanelet2 regulatory elements', () => {
  it('emits a regulatory_element relation with refers / ref_line members', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignalShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.type === 'regulatory_element')
    expect(re).toBeDefined()
    expect(re!.tags.subtype).toBe('traffic_light')

    // refers: synthesized 2-node way at the signal position, tagged traffic_light.
    const refers = re!.members.find(m => m.role === 'refers')
    expect(refers?.type).toBe('way')
    const refersWay = data.ways.get(refers!.ref)!
    expect(refersWay.tags.type).toBe('traffic_light')
    expect(refersWay.nodeRefs).toHaveLength(2)

    // ref_line: the stop line way is forced to type=stop_line.
    const refLine = re!.members.find(m => m.role === 'ref_line')
    expect(refLine?.type).toBe('way')
    expect(data.ways.get(refLine!.ref)?.tags.type).toBe('stop_line')

    // The affected lanelet references the regulatory element back.
    const lanelet = data.relations.find(r => r.tags.type === 'lanelet')!
    const reMember = lanelet.members.find(m => m.role === 'regulatory_element')
    expect(reMember).toEqual({ type: 'relation', ref: re!.id, role: 'regulatory_element' })
  })

  it('skips traffic lights without affectedLaneIds', () => {
    const shapes = laneWithSignalShapes().filter(s => s.id !== 'tl0')
    shapes.push(trafficLight('tl1', 100, -40))
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    expect(data.relations.some(r => r.tags.type === 'regulatory_element')).toBe(false)
  })

  it('tolerates dangling affectedLaneIds / stopLineId (deleted shapes)', () => {
    const shapes = laneWithSignalShapes().filter(s => s.id !== 'tl0')
    shapes.push(trafficLight('tl0', 100, -40, { affectedLaneIds: ['lane0', 'lane_deleted'], stopLineId: 'stop_deleted' }))
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.type === 'regulatory_element')!
    // The missing stop line is simply dropped from the members.
    expect(re.members.some(m => m.role === 'ref_line')).toBe(false)
    expect(re.members.some(m => m.role === 'refers')).toBe(true)

    // Every member reference in the output resolves (no dangling ids leak).
    const relationIds = new Set(data.relations.map(r => r.id))
    for (const r of data.relations) {
      for (const m of r.members) {
        if (m.type === 'relation') expect(relationIds.has(m.ref)).toBe(true)
        if (m.type === 'way') expect(data.ways.has(m.ref)).toBe(true)
        if (m.type === 'node') expect(data.nodes.has(m.ref)).toBe(true)
      }
    }
  })
})

describe('osmToShapes regulatory elements', () => {
  it('round-trips affectedLaneIds / stopLineId / position through Lanelet2', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignalShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const result = osmToShapes(parseOsmXml(xml))

    expect(result.lanes).toHaveLength(1)
    expect(result.trafficLights).toHaveLength(1)
    const tl = result.trafficLights[0]

    // Shape position / width come back from the refers way (origin embedded).
    expect(tl.x).toBeCloseTo(100, 3)
    expect(tl.y).toBeCloseTo(-40, 3)
    expect(tl.w).toBeCloseTo(30, 3)

    expect(tl.affectedLaneIds).toEqual([result.lanes[0].id])

    // Stop line imported as a linestring tagged type=stop_line.
    expect(tl.stopLineId).not.toBeNull()
    const stopLs = result.linestrings.find(ls => ls.id === tl.stopLineId)!
    expect(stopLs.attributes.type).toBe('stop_line')

    // Round-trip bookkeeping: relation / refers way OSM ids are retained.
    const re = parseOsmXml(xml).relations.find(r => r.tags.type === 'regulatory_element')!
    expect(tl.osmId).toBe(re.id)
    expect(tl.attributes.refers_osm_id).toBe(re.members.find(m => m.role === 'refers')!.ref)
  })

  it('restricts regulatory elements to the selected lanelets', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignalShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    const laneletId = data.relations.find(r => r.tags.type === 'lanelet')!.id
    // Selecting a non-existent lanelet imports neither the lane nor the signal.
    const none = osmToShapes(data, { selectedLaneIds: ['does-not-exist'] })
    expect(none.trafficLights).toHaveLength(0)
    // Selecting the affected lanelet brings the signal along.
    const some = osmToShapes(data, { selectedLaneIds: [laneletId] })
    expect(some.trafficLights).toHaveLength(1)
  })

  it('overrides the sidecar regulatory element on re-export instead of duplicating it', () => {
    const firstXml = exportToLanelet2(snapshot(laneWithSignalShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const imported = osmToShapes(parseOsmXml(firstXml))
    const tl = imported.trafficLights[0]

    // Rebuild a snapshot from the import result (as the editor would).
    const shapes: any[] = []
    for (const p of imported.points) shapes.push(point(p.id, p.x, p.y, p.osmId))
    for (const ls of imported.linestrings) {
      shapes.push({ ...linestring(ls.id, ls.pointIds, ls.osmId), props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId } })
    }
    for (const l of imported.lanes) {
      const shape = lane(l.id, l.leftBoundaryId, l.rightBoundaryId, l.osmId)
      shape.props.attributes = l.attributes as any
      shapes.push(shape)
    }
    shapes.push(
      trafficLight(tl.id, tl.x, tl.y, {
        w: tl.w,
        h: tl.h,
        osmId: tl.osmId,
        attributes: tl.attributes,
        affectedLaneIds: tl.affectedLaneIds,
        stopLineId: tl.stopLineId,
      })
    )

    const secondXml = exportToLanelet2(snapshot(shapes), {
      sidecar: { rawXml: firstXml, originLat: 35, originLon: 139 },
    })
    const data = parseOsmXml(secondXml)
    expect(data.relations.filter(r => r.tags.type === 'regulatory_element')).toHaveLength(1)
    expect(data.relations.filter(r => r.id === tl.osmId)).toHaveLength(1)
    const refersWays = [...data.ways.values()].filter(w => w.tags.type === 'traffic_light')
    expect(refersWays).toHaveLength(1)
    expect(refersWays[0].id).toBe(tl.attributes.refers_osm_id)
  })
})

const ODR_SIGNAL_MAP = (validity: string) => `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="r" length="100" id="1" junction="-1">
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry>
    </planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-2" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
    <signals>
      <signal id="42" s="50" t="-8" zOffset="4.5" name="tl" dynamic="yes" orientation="-" type="1000001" subtype="-1" width="0.5" height="1.0">${validity}</signal>
    </signals>
  </road>
</OpenDRIVE>`

describe('parseOpenDriveXml signal validity', () => {
  it('parses <validity> ranges and signal size', () => {
    const map = parseOpenDriveXml(ODR_SIGNAL_MAP('<validity fromLane="-2" toLane="-1"/>'))
    const sig = map.roads[0].signals[0]
    expect(sig.validity).toEqual([{ fromLane: -2, toLane: -1 }])
    expect(sig.width).toBeCloseTo(0.5)
    expect(sig.height).toBeCloseTo(1.0)
  })
})

describe('odrToShapes signals', () => {
  it('converts a signal with validity into a traffic light affecting only those lanes', () => {
    const result = odrToShapes(parseOpenDriveXml(ODR_SIGNAL_MAP('<validity fromLane="-1" toLane="-1"/>')))
    expect(result.trafficLights).toHaveLength(1)
    const tl = result.trafficLights[0]
    const lane1 = result.lanes.find(l => l.attributes.odr_lane_id === '-1')!
    expect(tl.affectedLaneIds).toEqual([lane1.id])
    // Position: (s=50, t=-8) on an east-heading road -> canvas (50 m, +8 m down).
    expect(tl.x).toBeCloseTo(50 * PIXELS_PER_METER, 6)
    expect(tl.y).toBeCloseTo(8 * PIXELS_PER_METER, 6)
    expect(tl.w).toBeCloseTo(0.5 * PIXELS_PER_METER, 6)
    expect(tl.h).toBeCloseTo(1.0 * PIXELS_PER_METER, 6)
    expect(tl.attributes.odr_signal_id).toBe('42')
    // Converted signals no longer show up in the "not converted" warning.
    expect(result.warnings.some(w => w.includes('signal'))).toBe(false)
  })

  it('falls back to all driving lanes of the road when validity is absent', () => {
    const result = odrToShapes(parseOpenDriveXml(ODR_SIGNAL_MAP('')))
    expect(result.trafficLights).toHaveLength(1)
    const tl = result.trafficLights[0]
    expect(tl.affectedLaneIds.sort()).toEqual(result.lanes.map(l => l.id).sort())
  })
})

describe('exportToOpenDrive regulatory layer', () => {
  it('emits validity / StopLine object / controller for an associated signal', () => {
    const shapes = laneWithSignalShapes()
    const tl = shapes.find(s => s.id === 'tl0') as any
    tl.props.controllerId = 'intersection-1'
    const xml = exportToOpenDrive(snapshot(shapes))

    expect(xml).toContain('<validity fromLane="-1" toLane="-1"/>')
    expect(xml).toContain('name="StopLine"')
    expect(xml).toMatch(/<controller id="1" name="intersection-1" sequence="0">/)
    expect(xml).toContain('<control signalId="1" type="0"/>')
  })

  it('attaches the signal to its affected lane even beyond the distance gate', () => {
    const shapes = laneWithSignalShapes()
    const tl = shapes.find(s => s.id === 'tl0') as any
    tl.x = 100
    tl.y = -2000 // ~120 m away from the lane; nearest-road gating would drop it.
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain('<signal ')
    expect(xml).toContain('<validity fromLane="-1" toLane="-1"/>')
  })

  it('round-trips validity through export -> import', () => {
    const xml = exportToOpenDrive(snapshot(laneWithSignalShapes()))
    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.lanes).toHaveLength(1)
    expect(result.trafficLights).toHaveLength(1)
    expect(result.trafficLights[0].affectedLaneIds).toEqual([result.lanes[0].id])
  })
})
