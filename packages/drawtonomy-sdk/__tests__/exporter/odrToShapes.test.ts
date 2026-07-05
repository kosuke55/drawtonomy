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

// Self-contained synthetic map whose reference line is a curved paramPoly3
// (no external fixture dependency). U(p) ≈ arc length, V(p) = 6e-3·p² bends the
// road laterally, so a correct sampler produces a visibly curved lane rather
// than a straight chord.
const PARAM_POLY3_CURVE = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="curve" length="40" id="1" junction="-1">
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="40">
        <paramPoly3 aU="0" bU="1" cU="0" dU="0" aV="0" bV="0" cV="6e-3" dV="0" pRange="arcLength"/>
      </geometry>
    </planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

describe('paramPoly3 reference line (synthetic)', () => {
  it('converts a curved paramPoly3 road into a finite, actually-curved lane', () => {
    const result = odrToShapes(parseOpenDriveXml(PARAM_POLY3_CURVE))
    expect(result.lanes).toHaveLength(1)
    // Every emitted boundary point is finite.
    for (const p of result.points) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    // Pick the lane's longest boundary and verify it bends: the midpoint must
    // deviate from the straight chord between its endpoints (a straight sampler
    // or a dropped paramPoly3 would collapse this to ~0).
    const boundary = result.linestrings.reduce((best, ls) =>
      ls.pointIds.length > best.pointIds.length ? ls : best
    , result.linestrings[0])
    const pts = boundary.pointIds.map(id => result.points.find(p => p.id === id)!)
    expect(pts.length).toBeGreaterThan(3)
    const a = pts[0]
    const b = pts[pts.length - 1]
    const mid = pts[Math.floor(pts.length / 2)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const chord = Math.hypot(dx, dy)
    const dev = Math.abs((mid.x - a.x) * dy - (mid.y - a.y) * dx) / chord
    // In pixels: cV·(L/2)² = 6e-3·400 = 2.4 m ≈ 2.4·PIXELS_PER_METER px of bend.
    expect(dev).toBeGreaterThan(1 * PIXELS_PER_METER)
  })

  it('does not warn about the paramPoly3 primitive (it is fully supported)', () => {
    const result = odrToShapes(parseOpenDriveXml(PARAM_POLY3_CURVE))
    expect(result.warnings.some(w => /paramPoly3/i.test(w))).toBe(false)
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
})
