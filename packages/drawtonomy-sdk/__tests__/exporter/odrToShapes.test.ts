import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, parseGeoReferenceOrigin } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'

const STRAIGHT_TWO_LANE = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="straight" length="100" id="1" junction="-1">
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
  </road>
</OpenDRIVE>`

const JUNCTION_MAP = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="in" length="50" id="1" junction="-1">
    <link><successor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="conn" length="20" id="5" junction="10">
    <link>
      <predecessor elementType="road" elementId="1" contactPoint="end"/>
      <successor elementType="road" elementId="2" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="50" y="0" hdg="0" length="20"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="out" length="50" id="2" junction="-1">
    <link><predecessor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="70" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <junction id="10" name="j">
    <connection id="0" incomingRoad="1" connectingRoad="5" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>
  </junction>
</OpenDRIVE>`

describe('parseGeoReferenceOrigin', () => {
  it('derives an exact origin from a tmerc PROJ string', () => {
    const o = parseGeoReferenceOrigin('+proj=tmerc +lat_0=35.62614 +lon_0=139.77525 +datum=WGS84')
    expect(o).toEqual({ lat: 35.62614, lon: 139.77525, approximate: false })
  })

  it('derives an approximate origin from a UTM zone', () => {
    const o = parseGeoReferenceOrigin('+proj=utm +zone=54 +datum=WGS84')
    expect(o).toEqual({ lat: 0, lon: 54 * 6 - 183, approximate: true })
  })

  it('returns null for unsupported or missing strings', () => {
    expect(parseGeoReferenceOrigin(null)).toBeNull()
    expect(parseGeoReferenceOrigin('+proj=longlat')).toBeNull()
  })
})

describe('odrToShapes', () => {
  it('converts a straight two-lane road with shared boundaries', () => {
    const result = odrToShapes(parseOpenDriveXml(STRAIGHT_TWO_LANE))

    expect(result.lanes).toHaveLength(2)
    // Three boundaries for two adjacent lanes: center, -1/-2 shared, outer.
    expect(result.linestrings).toHaveLength(3)

    const [lane1, lane2] = result.lanes
    expect(lane1.rightBoundaryId).toBe(lane2.leftBoundaryId)
    expect(lane1.invertLeft).toBe(false)
    expect(lane1.invertRight).toBe(false)
    expect(lane1.attributes.odr_road_id).toBe('1')
    expect(lane1.attributes.odr_lane_id).toBe('-1')
    // Lanelet-style vocabulary: relation type stays 'lanelet', the ODR lane
    // type is mapped to subtype and preserved verbatim in odr_type.
    expect(lane1.attributes.type).toBe('lanelet')
    expect(lane1.attributes.subtype).toBe('road')
    expect(lane1.attributes.odr_type).toBe('driving')

    // Geometry: ENU y up -> canvas y down. Right lanes lie at negative t
    // (negative ENU y), so their boundaries appear at positive canvas y.
    const lsById = new Map(result.linestrings.map(ls => [ls.id, ls]))
    const ptById = new Map(result.points.map(p => [p.id, p]))
    const yOf = (lsId: string): number => {
      const ls = lsById.get(lsId)!
      return ptById.get(ls.pointIds[0])!.y
    }
    expect(yOf(lane1.leftBoundaryId)).toBeCloseTo(0, 6)
    expect(yOf(lane1.rightBoundaryId)).toBeCloseTo(3.5 * PIXELS_PER_METER, 6)
    expect(yOf(lane2.rightBoundaryId)).toBeCloseTo(7 * PIXELS_PER_METER, 6)

    // 100 m line at default 5 m max step -> 21 stations per boundary.
    const ls = lsById.get(lane1.leftBoundaryId)!
    const xs = ls.pointIds.map(id => ptById.get(id)!.x)
    expect(xs[0]).toBeCloseTo(0, 6)
    expect(xs[xs.length - 1]).toBeCloseTo(100 * PIXELS_PER_METER, 6)

    // Origin derived from the tmerc geoReference.
    expect(result.originLatLon).toEqual({ lat: 35, lon: 139 })
    expect(result.sidecar.originLat).toBe(35)
    expect(result.sidecar.rawXml).toBe(STRAIGHT_TWO_LANE)
  })

  it('links lanes through junction connections (incoming -> connecting -> outgoing)', () => {
    const result = odrToShapes(parseOpenDriveXml(JUNCTION_MAP))
    expect(result.lanes).toHaveLength(3)

    const byRoad = new Map(result.lanes.map(l => [l.attributes.odr_road_id, l]))
    const incoming = byRoad.get('1')!
    const connecting = byRoad.get('5')!
    const outgoing = byRoad.get('2')!

    expect(connecting.attributes.odr_junction_id).toBe('10')
    expect(incoming.next).toContain(connecting.id)
    expect(connecting.prev).toContain(incoming.id)
    expect(connecting.next).toContain(outgoing.id)
    expect(outgoing.prev).toContain(connecting.id)
  })

  it('honors selectedRoadIds for partial import', () => {
    const result = odrToShapes(parseOpenDriveXml(JUNCTION_MAP), { selectedRoadIds: ['1'] })
    expect(result.lanes).toHaveLength(1)
    expect(result.lanes[0].attributes.odr_road_id).toBe('1')
  })

  it('reports warnings for parsed-but-unconverted features', () => {
    const withElevation = STRAIGHT_TWO_LANE.replace(
      '<lanes>',
      '<elevationProfile><elevation s="0" a="3" b="0" c="0" d="0"/></elevationProfile><lanes>'
    )
    const result = odrToShapes(parseOpenDriveXml(withElevation))
    expect(result.warnings.some(w => w.includes('Elevation'))).toBe(true)
  })
})

describe('round-trip smoke (import -> export)', () => {
  it('re-exports an imported straight road with consistent road count and length', () => {
    const imported = odrToShapes(parseOpenDriveXml(STRAIGHT_TWO_LANE))

    const shapes: unknown[] = []
    for (const p of imported.points) {
      shapes.push({
        id: p.id,
        type: 'point',
        x: p.x,
        y: p.y,
        rotation: 0,
        zIndex: 0,
        props: { color: 'black', visible: true, osmId: p.osmId },
      })
    }
    for (const ls of imported.linestrings) {
      shapes.push({
        id: ls.id,
        type: 'linestring',
        x: ls.x,
        y: ls.y,
        rotation: 0,
        zIndex: 0,
        props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId },
      })
    }
    for (const lane of imported.lanes) {
      shapes.push({
        id: lane.id,
        type: 'lane',
        x: lane.x,
        y: lane.y,
        rotation: 0,
        zIndex: 0,
        props: {
          leftBoundaryId: lane.leftBoundaryId,
          rightBoundaryId: lane.rightBoundaryId,
          invertLeft: lane.invertLeft,
          invertRight: lane.invertRight,
          color: 'default',
          size: 'm',
          attributes: lane.attributes,
          next: lane.next,
          prev: lane.prev,
          osmId: lane.osmId,
        },
      })
    }
    const snapshot: DrawtonomySnapshot = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      shapes: shapes as DrawtonomySnapshot['shapes'],
    }

    const xml = exportToOpenDrive(snapshot)
    const reparsed = parseOpenDriveXml(xml)
    // The two adjacent lanes share a boundary, so the exporter bundles them
    // back into a single <road> with right lanes -1 and -2 — the same
    // structure as the source file.
    expect(reparsed.roads).toHaveLength(1)
    const road = reparsed.roads[0]
    expect(road.length).toBeGreaterThan(99)
    expect(road.length).toBeLessThan(101)
    expect(road.laneSections[0].right.map(l => l.id)).toEqual([-1, -2])
  })
})

describe('roadMark carry-through', () => {
  const TWO_LANE_WITH_MARKS = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="r" length="100" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <center>
          <lane id="0" type="none" level="false">
            <roadMark sOffset="0" type="solid solid" weight="bold" color="yellow" width="0.25"/>
          </lane>
        </center>
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
            <roadMark sOffset="0" type="broken" weight="standard" color="white" width="0.13" laneChange="both"/>
          </lane>
          <lane id="-2" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
            <roadMark sOffset="0" type="solid" weight="standard" color="white" width="0.13"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

  it('imports roadMark type/color/weight/width into linestring attributes', () => {
    const result = odrToShapes(parseOpenDriveXml(TWO_LANE_WITH_MARKS))
    // 3 boundaries: center (lane id 0), shared between -1/-2, outer of -2
    expect(result.linestrings).toHaveLength(3)

    const lsById = new Map(result.linestrings.map(ls => [ls.id, ls]))
    const [lane1, lane2] = result.lanes
    const centerLs = lsById.get(lane1.leftBoundaryId)!
    const sharedLs = lsById.get(lane1.rightBoundaryId)!
    const outerLs = lsById.get(lane2.rightBoundaryId)!

    expect(centerLs.attributes.odr_road_mark_type).toBe('solid solid')
    expect(centerLs.attributes.odr_road_mark_color).toBe('yellow')
    expect(centerLs.attributes.odr_road_mark_weight).toBe('bold')
    expect(centerLs.attributes.odr_road_mark_width).toBe('0.25')

    expect(sharedLs.attributes.odr_road_mark_type).toBe('broken')
    expect(sharedLs.attributes.odr_road_mark_color).toBe('white')
    expect(sharedLs.attributes.odr_road_mark_lane_change).toBe('both')
    // subtype は描画用に潰されているはず (broken -> dashed)
    expect(sharedLs.attributes.subtype).toBe('dashed')

    expect(outerLs.attributes.odr_road_mark_type).toBe('solid')
    expect(outerLs.attributes.subtype).toBe('solid')
  })

  it('re-exports preserved roadMark attributes for edited roads', () => {
    const imported = odrToShapes(parseOpenDriveXml(TWO_LANE_WITH_MARKS))
    const shapes: unknown[] = []
    for (const p of imported.points) {
      shapes.push({
        id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0,
        props: { color: 'black', visible: true, osmId: p.osmId },
      })
    }
    for (const ls of imported.linestrings) {
      shapes.push({
        id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0,
        props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId },
      })
    }
    for (const lane of imported.lanes) {
      shapes.push({
        id: lane.id, type: 'lane', x: lane.x, y: lane.y, rotation: 0, zIndex: 0,
        props: {
          leftBoundaryId: lane.leftBoundaryId, rightBoundaryId: lane.rightBoundaryId,
          invertLeft: lane.invertLeft, invertRight: lane.invertRight,
          color: 'default', size: 'm', attributes: lane.attributes,
          next: lane.next, prev: lane.prev, osmId: lane.osmId,
        },
      })
    }
    // sidecar を渡さずに export することで未編集 carry-through ではなく
    // fitting exporter 経路を強制する (= roadMarkElementFor を通る)。
    const snapshot: DrawtonomySnapshot = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      shapes: shapes as DrawtonomySnapshot['shapes'],
    }
    const xml = exportToOpenDrive(snapshot)
    // ↓ 中央線 (solid solid + yellow + bold + 0.25) が出力されているか
    expect(xml).toContain('type="solid solid"')
    expect(xml).toContain('color="yellow"')
    expect(xml).toContain('weight="bold"')
    expect(xml).toContain('width="0.25"')
    // ↓ -1 と -2 の間 (broken + white)
    expect(xml).toMatch(/type="broken"[^>]*color="white"/)
  })
})

describe('round-trip smoke (import -> Lanelet2)', () => {
  it('re-imports an OpenDRIVE map exported as Lanelet2 with the same lane count', async () => {
    const { exportToLanelet2 } = await import('../../src/exporter/lanelet2')
    const { parseOsmXml } = await import('../../src/exporter/osmParser')
    const { osmToShapes } = await import('../../src/exporter/osmToShapes')

    const imported = odrToShapes(parseOpenDriveXml(STRAIGHT_TWO_LANE))
    const shapes: unknown[] = []
    for (const p of imported.points) {
      shapes.push({ id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: p.osmId } })
    }
    for (const ls of imported.linestrings) {
      shapes.push({ id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0, props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId } })
    }
    for (const lane of imported.lanes) {
      shapes.push({ id: lane.id, type: 'lane', x: lane.x, y: lane.y, rotation: 0, zIndex: 0, props: { leftBoundaryId: lane.leftBoundaryId, rightBoundaryId: lane.rightBoundaryId, invertLeft: lane.invertLeft, invertRight: lane.invertRight, color: 'default', size: 'm', attributes: lane.attributes, next: lane.next, prev: lane.prev, osmId: lane.osmId } })
    }
    const snapshot: DrawtonomySnapshot = { version: '1.1', timestamp: new Date().toISOString(), shapes: shapes as DrawtonomySnapshot['shapes'] }

    // The lanelet vocabulary must survive: type=lanelet relations are the only
    // ones the OSM importer converts back into lanes.
    const osmXml = exportToLanelet2(snapshot, { mapOrigin: { lat: 35, lon: 139 } })
    const reimported = osmToShapes(parseOsmXml(osmXml))
    expect(reimported.lanes).toHaveLength(imported.lanes.length)
    expect(reimported.lanes[0].attributes.subtype).toBe('road')
    expect(reimported.lanes[0].attributes.odr_type).toBe('driving')
  })
})

describe('esmini sample map (fixture)', () => {
  const fixturePath = join(__dirname, '..', 'fixtures', 'fabriksgatan.xodr')
  it.skipIf(!existsSync(fixturePath))('parses and converts fabriksgatan.xodr', () => {
    const xml = readFileSync(fixturePath, 'utf-8')
    const map = parseOpenDriveXml(xml)
    expect(map.roads.length).toBeGreaterThan(10)
    expect(map.junctions.length).toBeGreaterThan(0)

    const result = odrToShapes(map)
    expect(result.lanes.length).toBeGreaterThan(10)
    // Junction-connected lanes must be linked into the network.
    const linked = result.lanes.filter(l => l.next.length + l.prev.length > 0)
    expect(linked.length).toBeGreaterThan(10)
    // Every junction road carries its junction id for later re-export.
    const junctionLanes = result.lanes.filter(l => l.attributes.odr_junction_id)
    expect(junctionLanes.length).toBeGreaterThan(0)
    // All boundary points must be finite.
    for (const p of result.points) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  // soderleden.xodr uses a direct junction (linkedRoad). Before the parser
  // tolerated it, the missing `connectingRoad` threw and the whole map failed
  // to parse -> 0 lanes -> highway_merge had no road network / no actors.
  const soderledenPath = join(__dirname, '..', 'fixtures', 'soderleden.xodr')
  it.skipIf(!existsSync(soderledenPath))('parses soderleden.xodr (direct junction) and expands lanes', () => {
    const xml = readFileSync(soderledenPath, 'utf-8')
    const map = parseOpenDriveXml(xml)
    expect(map.roads.length).toBeGreaterThan(0)
    // The direct junction must be present and recognized.
    const direct = map.junctions.find(j => j.type === 'direct')
    expect(direct).toBeTruthy()
    expect(direct!.connections.length).toBeGreaterThan(0)
    // Direct-junction connections normalize linkedRoad into connectingRoad.
    for (const conn of direct!.connections) {
      expect(conn.connectingRoad).not.toBe('')
    }

    const result = odrToShapes(map)
    // Road network must materialize (0 lanes -> N lanes).
    expect(result.lanes.length).toBeGreaterThan(0)
    // The direct junction must actually wire lanes across the linked roads.
    const linked = result.lanes.filter(l => l.next.length + l.prev.length > 0)
    expect(linked.length).toBeGreaterThan(0)
    for (const p of result.points) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

// A straight road carrying a single <object type="parkingSpace"> with a
// four-corner <cornerLocal> outline (the esmini parking_demo pattern).
const PARKING_LOCAL = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="r" length="100" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
    <objects>
      <object type="parkingSpace" name="parkingSpace" id="7" s="10" t="-5" hdg="0" length="0" width="0">
        <outlines>
          <outline id="0" closed="true">
            <cornerLocal u="0" v="0" z="0" height="4" id="0"/>
            <cornerLocal u="2.5" v="0" z="0" height="4" id="1"/>
            <cornerLocal u="2.5" v="5" z="0" height="4" id="2"/>
            <cornerLocal u="0" v="5" z="0" height="4" id="3"/>
          </outline>
        </outlines>
      </object>
    </objects>
  </road>
</OpenDRIVE>`

// A parking space with no <outlines>; the footprint is an oriented rectangle
// derived from s/t/hdg/length/width.
const PARKING_RECT = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="r" length="100" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
    <objects>
      <object type="parkingSpace" name="parkingSpace" id="8" s="20" t="-5" hdg="0" length="2.5" width="5"/>
    </objects>
  </road>
</OpenDRIVE>`

// Two rows of parking spaces declared purely via <repeat> (no <outlines>),
// mirroring esmini parking_demo objects 11/12: each object sits at t=0 but its
// repeat places instances at tStart=tEnd=∓12.7 so the two rows straddle the road
// centre by ±12.7 m. distance=2.5 over length=10 => 5 instances per row (curS
// 0/2.5/5/7.5/10; the 2.4 m footprint stays within the 20 m road at each).
const PARKING_REPEAT_ROWS = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="8"/>
  <road name="r" length="20" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="20"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
    <objects>
      <object type="parkingSpace" name="p1" id="11" s="0" t="0.0" hdg="0" length="2.4" width="4.9">
        <repeat distance="2.5" tStart="-12.7" tEnd="-12.7" length="10" s="1.3"/>
      </object>
      <object type="parkingSpace" name="p2" id="12" s="0" t="0.0" hdg="0" length="2.4" width="4.9">
        <repeat distance="2.5" tStart="12.7" tEnd="12.7" length="10" s="1.3"/>
      </object>
    </objects>
  </road>
</OpenDRIVE>`

// A single continuous object (distance=0): the repeat declares a swept footprint
// rather than discrete copies, so exactly one polygon is materialized at the span
// start (t=3 here). Guards against distance=0 objects silently vanishing.
const PARKING_REPEAT_CONTINUOUS = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="8"/>
  <road name="r" length="100" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
    <objects>
      <object type="parkingSpace" name="cont" id="20" s="0" t="0.0" hdg="0" length="2.4" width="5">
        <repeat distance="0" tStart="3" tEnd="3" length="30" s="10"/>
      </object>
    </objects>
  </road>
</OpenDRIVE>`

describe('odrToShapes parkingSpace objects', () => {
  it('converts a <cornerLocal> parking space into a polygon footprint with origin markers', () => {
    const result = odrToShapes(parseOpenDriveXml(PARKING_LOCAL))
    expect(result.parkingSpaces).toBeDefined()
    expect(result.parkingSpaces).toHaveLength(1)
    const ps = result.parkingSpaces![0]
    expect(ps.points).toHaveLength(4)
    // Origin markers: type + odr_object_id / odr_road_id / odr_type.
    expect(ps.attributes.type).toBe('parking_space')
    expect(ps.attributes.odr_object_id).toBe('7')
    expect(ps.attributes.odr_road_id).toBe('1')
    expect(ps.attributes.odr_type).toBe('parkingSpace')
    // Geometry: object origin at s=10, t=-5 (ENU y=-5 -> canvas y=+5m). The
    // first corner (u=0,v=0) coincides with the origin.
    expect(ps.points[0].x).toBeCloseTo(10 * PIXELS_PER_METER, 3)
    expect(ps.points[0].y).toBeCloseTo(5 * PIXELS_PER_METER, 3)
    // Corner (u=2.5,v=0) advances along the road heading (+x).
    expect(ps.points[1].x).toBeCloseTo(12.5 * PIXELS_PER_METER, 3)
    expect(ps.points[1].y).toBeCloseTo(5 * PIXELS_PER_METER, 3)
    // All vertices finite.
    for (const p of ps.points) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('derives an oriented-rectangle footprint when no outline is present', () => {
    const result = odrToShapes(parseOpenDriveXml(PARKING_RECT))
    expect(result.parkingSpaces).toHaveLength(1)
    expect(result.parkingSpaces![0].points).toHaveLength(4)
    expect(result.parkingSpaces![0].attributes.odr_object_id).toBe('8')
  })

  it('does not disturb the road carry-through hash (source object stays verbatim)', () => {
    // A parking space is materialized as a polygon only; the road that carries
    // it must still hash as unedited so the exporter re-emits it verbatim.
    const withPs = odrToShapes(parseOpenDriveXml(PARKING_LOCAL))
    const withoutPs = odrToShapes(
      parseOpenDriveXml(PARKING_LOCAL.replace(/<objects>[\s\S]*<\/objects>/, ''))
    )
    const hashWith = withPs.sidecar.roadRecords?.['1'].stateHash
    const hashWithout = withoutPs.sidecar.roadRecords?.['1'].stateHash
    expect(hashWith).toBeDefined()
    expect(hashWith).toBe(hashWithout)
  })
})

// Average (centroid) y of a polygon's vertices, in metres (canvas y -> ENU y is
// negated; here we only compare relative sign/magnitude so canvas px is fine).
function centroidY(points: { x: number; y: number }[]): number {
  return points.reduce((s, p) => s + p.y, 0) / points.length
}

describe('odrToShapes parkingSpace <repeat>', () => {
  it('expands two repeat rows into instances split to ±12.7 m about the road centre', () => {
    const result = odrToShapes(parseOpenDriveXml(PARKING_REPEAT_ROWS))
    expect(result.parkingSpaces).toBeDefined()
    // 5 instances per row (curS 0/2.5/5/7.5/10), two rows => 10 polygons.
    expect(result.parkingSpaces).toHaveLength(10)

    const row11 = result.parkingSpaces!.filter(ps => ps.attributes.odr_object_id === '11')
    const row12 = result.parkingSpaces!.filter(ps => ps.attributes.odr_object_id === '12')
    expect(row11).toHaveLength(5)
    expect(row12).toHaveLength(5)

    // The two rows must NOT collapse onto the road centre: their footprints sit on
    // opposite sides, ~25.4 m (2 x 12.7) apart. (Before <repeat> support both rows
    // rendered at t=0 and overlapped exactly.)
    const y11 = centroidY(row11.flatMap(ps => ps.points)) / PIXELS_PER_METER
    const y12 = centroidY(row12.flatMap(ps => ps.points)) / PIXELS_PER_METER
    // tStart=-12.7 (ENU) maps to +12.7 canvas y and vice versa; assert opposite
    // signs and the correct magnitude either way.
    expect(Math.sign(y11)).toBe(-Math.sign(y12))
    expect(Math.abs(y11)).toBeCloseTo(12.7, 1)
    expect(Math.abs(y12)).toBeCloseTo(12.7, 1)
    expect(Math.abs(y11 - y12)).toBeCloseTo(25.4, 1)

    // Instances of one row are spaced along the road by the repeat distance (2.5 m).
    const xs11 = row11
      .map(ps => ps.points.reduce((s, p) => s + p.x, 0) / ps.points.length / PIXELS_PER_METER)
      .sort((a, b) => a - b)
    for (let i = 1; i < xs11.length; i++) {
      expect(xs11[i] - xs11[i - 1]).toBeCloseTo(2.5, 1)
    }
  })

  it('materializes a distance=0 continuous repeat as a single footprint at the span start', () => {
    const result = odrToShapes(parseOpenDriveXml(PARKING_REPEAT_CONTINUOUS))
    expect(result.parkingSpaces).toHaveLength(1)
    const ps = result.parkingSpaces![0]
    expect(ps.attributes.odr_object_id).toBe('20')
    // Placed at the repeat span start s=10, t=3 (ENU) -> canvas y = -3 m.
    const cy = centroidY(ps.points) / PIXELS_PER_METER
    expect(cy).toBeCloseTo(-3, 1)
    const cx = ps.points.reduce((s, p) => s + p.x, 0) / ps.points.length / PIXELS_PER_METER
    expect(cx).toBeCloseTo(10, 1)
  })
})

describe('esmini parking_demo (fixture)', () => {
  const fixturePath = join(__dirname, '..', 'fixtures', 'parking_demo.xodr')
  it.skipIf(!existsSync(fixturePath))(
    'expands parkingSpace <repeat> rows into many polygons and keeps the existing crosswalks',
    () => {
      const xml = readFileSync(fixturePath, 'utf-8')
      const result = odrToShapes(parseOpenDriveXml(xml))
      // Objects 4/6/8/11/12 carry a <repeat>; 5/7 are placed once. With repeat
      // support each replicated object materializes many instances (7 parking
      // objects -> far more than 7 polygons). Assert the expansion happened
      // rather than pinning an exact count that would move with fixture tweaks.
      expect(result.parkingSpaces!.length).toBeGreaterThan(7)
      // Crosswalk conversion is unchanged by parkingSpace support: the fixture
      // carries 3 <object type="crosswalk"> but one lacks length/width, so 2 are
      // materialized (the pre-existing materializeCrosswalks guard).
      expect(result.crosswalks).toHaveLength(2)
      for (const ps of result.parkingSpaces!) {
        expect(ps.points.length).toBeGreaterThanOrEqual(3)
        expect(ps.attributes.type).toBe('parking_space')
        expect(ps.attributes.odr_object_id).not.toBe('')
        expect(ps.attributes.odr_road_id).not.toBe('')
        for (const p of ps.points) {
          expect(Number.isFinite(p.x)).toBe(true)
          expect(Number.isFinite(p.y)).toBe(true)
        }
      }

      // The regression this fixes: objects 11 and 12 on road 3 both sit at t=0
      // but their <repeat> declares tStart=tEnd=-12.7 and +12.7 respectively, so
      // the two rows must straddle the road centre 25.4 m (2 x 12.7) apart. Road 3
      // is angled, so the offset splits across x and y — assert the Euclidean
      // distance between the row centroids. Before <repeat> support both rows
      // rendered at t=0 and their centroids coincided (distance 0).
      const row11 = result.parkingSpaces!.filter(
        ps => ps.attributes.odr_object_id === '11' && ps.attributes.odr_road_id === '3'
      )
      const row12 = result.parkingSpaces!.filter(
        ps => ps.attributes.odr_object_id === '12' && ps.attributes.odr_road_id === '3'
      )
      expect(row11.length).toBeGreaterThan(1)
      expect(row12.length).toBeGreaterThan(1)
      const c = (pts: { x: number; y: number }[]) => ({
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length / PIXELS_PER_METER,
        y: centroidY(pts) / PIXELS_PER_METER,
      })
      const c11 = c(row11.flatMap(ps => ps.points))
      const c12 = c(row12.flatMap(ps => ps.points))
      expect(Math.hypot(c11.x - c12.x, c11.y - c12.y)).toBeCloseTo(25.4, 1)
    }
  )
})
