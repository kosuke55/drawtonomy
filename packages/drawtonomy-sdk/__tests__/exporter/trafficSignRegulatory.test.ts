// Traffic sign regulatory element tests:
// Lanelet2 traffic_sign / speed_limit export/import round-trips and
// OpenDRIVE static signal (dynamic="no") carry-through.

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

function trafficSign(id: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'traffic_sign',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w: 20,
      h: 20,
      color: 'black',
      size: 'm',
      attributes: { sign_code: 'de274' },
      osmId: '',
      ...extra,
    },
  }
}

/** A single lane (x: 0..100), a vertical stop line at x=80, and a sign. */
function laneWithSignShapes() {
  return [
    point('p0', 0, 0),
    point('p1', 100, 0),
    point('p2', 0, 50),
    point('p3', 100, 50),
    linestring('left', ['p0', 'p1']),
    linestring('right', ['p2', 'p3']),
    lane('lane0', 'left', 'right'),
    point('ps0', 80, 2),
    point('ps1', 80, 48),
    linestring('stop0', ['ps0', 'ps1']),
    trafficSign('ts0', 80, -40, { affectedLaneIds: ['lane0'], stopLineId: 'stop0' }),
  ]
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
    shapes.push(shape)
  }
  for (const ts of imported.trafficSigns) {
    shapes.push(
      trafficSign(ts.id, ts.x, ts.y, {
        w: ts.w,
        h: ts.h,
        osmId: ts.osmId,
        attributes: ts.attributes,
        affectedLaneIds: ts.affectedLaneIds,
        stopLineId: ts.stopLineId,
      })
    )
  }
  return shapes
}

describe('exportToLanelet2 traffic_sign regulatory elements', () => {
  it('emits a traffic_sign regulatory element with refers / ref_line members', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.type === 'regulatory_element')
    expect(re).toBeDefined()
    expect(re!.tags.subtype).toBe('traffic_sign')

    // refers: synthesized 2-node way at the sign position, tagged
    // type=traffic_sign with the sign code as its subtype.
    const refers = re!.members.find(m => m.role === 'refers')
    expect(refers?.type).toBe('way')
    const refersWay = data.ways.get(refers!.ref)!
    expect(refersWay.tags.type).toBe('traffic_sign')
    expect(refersWay.tags.subtype).toBe('de274')
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

  it('emits subtype=speed_limit with a sign_type tag for speed limit signs', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(
      trafficSign('ts0', 80, -40, {
        affectedLaneIds: ['lane0'],
        attributes: { sign_code: 'de274-60', sign_type: '60 km/h' },
      })
    )
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.type === 'regulatory_element')!
    expect(re.tags.subtype).toBe('speed_limit')
    expect(re.tags.sign_type).toBe('60 km/h')
    const refersWay = data.ways.get(re.members.find(m => m.role === 'refers')!.ref)!
    expect(refersWay.tags.type).toBe('traffic_sign')
    expect(refersWay.tags.subtype).toBe('de274-60')
  })

  it('falls back to attributes.subtype, then "unknown", for the sign code', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(trafficSign('ts0', 80, -40, { affectedLaneIds: ['lane0'], attributes: { subtype: 'usR1-1' } }))
    shapes.push(trafficSign('ts1', 90, -40, { affectedLaneIds: ['lane0'], attributes: {} }))
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    const subtypes = [...data.ways.values()]
      .filter(w => w.tags.type === 'traffic_sign')
      .map(w => w.tags.subtype)
      .sort()
    expect(subtypes).toEqual(['unknown', 'usR1-1'])
  })

  it('skips traffic signs without affectedLaneIds', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(trafficSign('ts1', 80, -40))
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    expect(data.relations.some(r => r.tags.type === 'regulatory_element')).toBe(false)
  })

  it('tolerates dangling affectedLaneIds / stopLineId (deleted shapes)', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(trafficSign('ts0', 80, -40, { affectedLaneIds: ['lane0', 'lane_deleted'], stopLineId: 'stop_deleted' }))
    const xml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)

    const re = data.relations.find(r => r.tags.type === 'regulatory_element')!
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

describe('osmToShapes traffic_sign regulatory elements', () => {
  it('round-trips sign_code / affectedLaneIds / stopLineId / position through Lanelet2', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const result = osmToShapes(parseOsmXml(xml))

    expect(result.lanes).toHaveLength(1)
    expect(result.trafficSigns).toHaveLength(1)
    const ts = result.trafficSigns[0]

    // Shape position / width come back from the refers way (origin embedded).
    expect(ts.x).toBeCloseTo(80, 3)
    expect(ts.y).toBeCloseTo(-40, 3)
    expect(ts.w).toBeCloseTo(20, 3)

    expect(ts.attributes.sign_code).toBe('de274')
    expect(ts.affectedLaneIds).toEqual([result.lanes[0].id])

    // Stop line imported as a linestring tagged type=stop_line.
    expect(ts.stopLineId).not.toBeNull()
    const stopLs = result.linestrings.find(ls => ls.id === ts.stopLineId)!
    expect(stopLs.attributes.type).toBe('stop_line')

    // Round-trip bookkeeping: relation / refers way OSM ids are retained.
    const re = parseOsmXml(xml).relations.find(r => r.tags.type === 'regulatory_element')!
    expect(ts.osmId).toBe(re.id)
    expect(ts.attributes.refers_osm_id).toBe(re.members.find(m => m.role === 'refers')!.ref)
  })

  it('promotes speed_limit regulatory elements and keeps subtype / sign_type', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(
      trafficSign('ts0', 80, -40, {
        affectedLaneIds: ['lane0'],
        attributes: { sign_code: 'de274-60', sign_type: '60 km/h' },
      })
    )
    const firstXml = exportToLanelet2(snapshot(shapes), { mapOrigin: { lat: 35, lon: 139 } })
    const result = osmToShapes(parseOsmXml(firstXml))
    expect(result.trafficSigns).toHaveLength(1)
    const ts = result.trafficSigns[0]
    expect(ts.attributes.subtype).toBe('speed_limit')
    expect(ts.attributes.sign_type).toBe('60 km/h')
    expect(ts.attributes.sign_code).toBe('de274-60')

    // Re-export keeps the speed_limit subtype.
    const secondXml = exportToLanelet2(snapshot(shapesFromImport(result)), {
      sidecar: { rawXml: firstXml, originLat: 35, originLon: 139 },
    })
    const re = parseOsmXml(secondXml).relations.find(r => r.tags.type === 'regulatory_element')!
    expect(re.tags.subtype).toBe('speed_limit')
    expect(re.tags.sign_type).toBe('60 km/h')
  })

  it('restricts traffic sign elements to the selected lanelets', () => {
    const xml = exportToLanelet2(snapshot(laneWithSignShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const data = parseOsmXml(xml)
    const laneletId = data.relations.find(r => r.tags.type === 'lanelet')!.id
    const none = osmToShapes(data, { selectedLaneIds: ['does-not-exist'] })
    expect(none.trafficSigns).toHaveLength(0)
    const some = osmToShapes(data, { selectedLaneIds: [laneletId] })
    expect(some.trafficSigns).toHaveLength(1)
  })

  it('keeps a sign_type-only speed_limit relation (no refers way) sidecar-only', () => {
    const sidecar = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='drawtonomy' drawtonomy_origin_lat='35.0' drawtonomy_origin_lon='139.0'>
  <relation id='900'>
    <tag k='type' v='regulatory_element' />
    <tag k='subtype' v='speed_limit' />
    <tag k='sign_type' v='50 km/h' />
  </relation>
</osm>`
    const imported = osmToShapes(parseOsmXml(sidecar))
    expect(imported.trafficSigns).toHaveLength(0)
    // The relation survives a round trip verbatim through the sidecar.
    const xml = exportToLanelet2(snapshot([]), { sidecar: { rawXml: sidecar, originLat: 35, originLon: 139 } })
    const re = parseOsmXml(xml).relations.find(r => r.id === '900')!
    expect(re.tags.sign_type).toBe('50 km/h')
  })

  it('overrides the sidecar regulatory element on re-export instead of duplicating it', () => {
    const firstXml = exportToLanelet2(snapshot(laneWithSignShapes()), { mapOrigin: { lat: 35, lon: 139 } })
    const firstData = parseOsmXml(firstXml)
    const imported = osmToShapes(firstData)
    const ts = imported.trafficSigns[0]

    const secondXml = exportToLanelet2(snapshot(shapesFromImport(imported)), {
      sidecar: { rawXml: firstXml, originLat: 35, originLon: 139 },
    })
    const data = parseOsmXml(secondXml)
    expect(data.relations.filter(r => r.tags.type === 'regulatory_element')).toHaveLength(1)
    expect(data.relations.filter(r => r.id === ts.osmId)).toHaveLength(1)
    const refersWays = [...data.ways.values()].filter(w => w.tags.type === 'traffic_sign')
    expect(refersWays).toHaveLength(1)
    expect(refersWays[0].id).toBe(ts.attributes.refers_osm_id)
    // Entity counts are stable across the round trip (nothing duplicated).
    expect(data.relations).toHaveLength(firstData.relations.length)
    expect(data.ways.size).toBe(firstData.ways.size)
    expect(data.nodes.size).toBe(firstData.nodes.size)
  })
})

const ODR_SIGN_MAP = (signal: string) => `<?xml version="1.0"?>
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
      ${signal}
    </signals>
  </road>
</OpenDRIVE>`

describe('odrToShapes static signals', () => {
  it('converts a dynamic="no" signal with validity into a traffic sign', () => {
    const xml = ODR_SIGN_MAP(
      `<signal id="9" s="50" t="-8" zOffset="2" name="speed60" dynamic="no" orientation="-" type="274" subtype="60" country="DE" width="0.6" height="0.6"><validity fromLane="-1" toLane="-1"/></signal>`
    )
    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.trafficLights).toHaveLength(0)
    expect(result.trafficSigns).toHaveLength(1)
    const ts = result.trafficSigns[0]
    const lane1 = result.lanes.find(l => l.attributes.odr_lane_id === '-1')!
    expect(ts.affectedLaneIds).toEqual([lane1.id])
    // Position: (s=50, t=-8) on an east-heading road -> canvas (50 m, +8 m down).
    expect(ts.x).toBeCloseTo(50 * PIXELS_PER_METER, 6)
    expect(ts.y).toBeCloseTo(8 * PIXELS_PER_METER, 6)
    expect(ts.w).toBeCloseTo(0.6 * PIXELS_PER_METER, 6)
    expect(ts.attributes.odr_signal_id).toBe('9')
    expect(ts.attributes.odr_signal_type).toBe('274')
    expect(ts.attributes.odr_signal_subtype).toBe('60')
    expect(ts.attributes.odr_country).toBe('DE')
    // Third-party files carry no signAttributes stash: the name is the code.
    expect(ts.attributes.sign_code).toBe('speed60')
    // Converted signals no longer show up in the "not converted" warning.
    expect(result.warnings.some(w => w.includes('signal'))).toBe(false)
  })

  it('leaves dynamic unknown-type signals unconverted (warning)', () => {
    const xml = ODR_SIGN_MAP(
      `<signal id="9" s="50" t="-8" zOffset="2" name="x" dynamic="yes" orientation="-" type="999" subtype="-1" width="0.6" height="0.6"/>`
    )
    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.trafficSigns).toHaveLength(0)
    expect(result.trafficLights).toHaveLength(0)
    expect(result.warnings.some(w => w.includes('signal'))).toBe(true)
  })
})

describe('exportToOpenDrive traffic signs', () => {
  it('emits a static signal with validity / name=sign_code / signAttributes userData', () => {
    const xml = exportToOpenDrive(snapshot(laneWithSignShapes()))
    expect(xml).toMatch(/<signal [^>]*name="de274"[^>]*dynamic="no"[^>]*type="-1"[^>]*country="OpenDRIVE"/)
    expect(xml).toContain('<validity fromLane="-1" toLane="-1"/>')
    expect(xml).toContain('<userData code="signAttributes"')
    expect(xml).toContain('name="StopLine"')
  })

  it('reuses recorded odr_signal_type / odr_signal_subtype / odr_country attributes', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(
      trafficSign('ts0', 80, -40, {
        affectedLaneIds: ['lane0'],
        attributes: { sign_code: 'speed60', odr_signal_type: '274', odr_signal_subtype: '60', odr_country: 'DE' },
      })
    )
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toMatch(/<signal [^>]*dynamic="no"[^>]*type="274" subtype="60" country="DE"/)
  })

  it('round-trips sign_code / affectedLaneIds / stop line through export -> import', () => {
    const xml = exportToOpenDrive(snapshot(laneWithSignShapes()))
    const result = odrToShapes(parseOpenDriveXml(xml))
    expect(result.lanes).toHaveLength(1)
    expect(result.trafficSigns).toHaveLength(1)
    const ts = result.trafficSigns[0]
    expect(ts.attributes.sign_code).toBe('de274')
    expect(ts.affectedLaneIds).toEqual([result.lanes[0].id])
    expect(ts.stopLineId).not.toBeNull()
    const stopLs = result.linestrings.find(ls => ls.id === ts.stopLineId)!
    expect(stopLs.attributes.type).toBe('stop_line')
    // The sign itself converted; only the StopLine helper object remains
    // unconverted (same as the traffic light path).
    expect(result.warnings.some(w => /[1-9]\d* signal/.test(w))).toBe(false)
  })

  it('round-trips a speed limit sign_type through OpenDRIVE userData', () => {
    const shapes = laneWithSignShapes().filter(s => s.id !== 'ts0')
    shapes.push(
      trafficSign('ts0', 80, -40, {
        affectedLaneIds: ['lane0'],
        attributes: { sign_code: 'de274-60', sign_type: '60 km/h', subtype: 'speed_limit' },
      })
    )
    const result = odrToShapes(parseOpenDriveXml(exportToOpenDrive(snapshot(shapes))))
    expect(result.trafficSigns).toHaveLength(1)
    const ts = result.trafficSigns[0]
    expect(ts.attributes.sign_type).toBe('60 km/h')
    expect(ts.attributes.subtype).toBe('speed_limit')
    expect(ts.attributes.sign_code).toBe('de274-60')
  })
})

describe('exportToOpenDrive traffic sign carry-through', () => {
  const SIGN_XODR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="sign">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="a" length="60" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="60"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
    <signals>
      <signal id="7" s="55" t="-2" zOffset="2" name="stop" dynamic="no" orientation="+" type="206" subtype="-1" country="DE" value="0" height="0.8" width="0.8">
        <validity fromLane="-1" toLane="-1"/>
      </signal>
    </signals>
  </road>
</OpenDRIVE>`

  function snapshotFrom(imported: ReturnType<typeof odrToShapes>): DrawtonomySnapshot {
    const shapes = shapesFromImport(imported)
    const snap = snapshot(shapes)
    if (imported.originLatLon) snap.origin = imported.originLatLon
    return snap
  }

  it('re-emits the road (including the static signal) verbatim when unedited', () => {
    const imported = odrToShapes(parseOpenDriveXml(SIGN_XODR))
    expect(imported.trafficSigns).toHaveLength(1)
    expect(imported.sidecar.roadRecords).toBeDefined()
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const roadText = SIGN_XODR.match(/<road[\s\S]*<\/road>/)![0]
    expect(out).toContain(roadText)
  })

  it('regenerates the signal when the sign was moved', () => {
    const imported = odrToShapes(parseOpenDriveXml(SIGN_XODR))
    const snap = snapshotFrom(imported)
    const ts = snap.shapes.find(s => s.type === 'traffic_sign')! as any
    ts.x += 100 // ~6 m sideways
    const out = exportToOpenDrive(snap, { sidecar: imported.sidecar })
    const roadText = SIGN_XODR.match(/<road[\s\S]*<\/road>/)![0]
    expect(out).not.toContain(roadText)
    expect(out).toMatch(/<signal [^>]*dynamic="no"[^>]*type="206"[^>]*country="DE"/)
    expect(out).toContain('<validity fromLane="-1" toLane="-1"/>')
  })
})
