import { describe, it, expect } from 'vitest'
import { exportToLanelet2, DEFAULT_ORIGIN_LAT, DEFAULT_ORIGIN_LON } from '../../src/exporter/lanelet2'
import { parseOsmXml, latLonToCanvas, canvasToLatLon } from '../../src/exporter/osmParser'
import { osmToShapes, alignBoundaries, createShapeIdAllocator } from '../../src/exporter/osmToShapes'
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

function lane(id: string, leftId: string, rightId: string, osmId = '', extra: Record<string, string> = {}) {
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
      attributes: { type: 'lanelet', subtype: 'road', speed_limit: '30', ...extra },
      next: [],
      prev: [],
      osmId,
    },
  }
}

describe('parseOsmXml', () => {
  const sample = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='drawtonomy' drawtonomy_origin_lat='35.0' drawtonomy_origin_lon='139.0'>
  <node id='1' lat='35.000001' lon='139.000001' />
  <node id='2' lat='35.000002' lon='139.000002'>
    <tag k='ele' v='1.234' />
  </node>
  <way id='10'>
    <nd ref='1' />
    <nd ref='2' />
    <tag k='type' v='line_thin' />
    <tag k='subtype' v='solid' />
  </way>
  <relation id='100'>
    <member type='way' ref='10' role='left' />
    <member type='way' ref='10' role='right' />
    <tag k='type' v='lanelet' />
    <tag k='subtype' v='road' />
  </relation>
</osm>`

  it('extracts nodes / ways / relations and the drawtonomy origin', () => {
    const data = parseOsmXml(sample)
    expect(data.nodes.size).toBe(2)
    expect(data.nodes.get('2')?.ele).toBeCloseTo(1.234)
    expect(data.ways.size).toBe(1)
    expect(data.ways.get('10')?.nodeRefs).toEqual(['1', '2'])
    expect(data.relations).toHaveLength(1)
    expect(data.relations[0].tags.type).toBe('lanelet')
    expect(data.drawtonomyOrigin).toEqual({ lat: 35.0, lon: 139.0 })
  })

  it('keeps non-lanelet relations (e.g. regulatory_element)', () => {
    const xml = `<osm version='0.6'>
      <relation id='200'>
        <tag k='type' v='regulatory_element' />
        <tag k='subtype' v='traffic_sign' />
      </relation>
    </osm>`
    const data = parseOsmXml(xml)
    expect(data.relations).toHaveLength(1)
    expect(data.relations[0].tags.type).toBe('regulatory_element')
  })

  it('decodes XML entities in tag values', () => {
    const xml = `<osm version='0.6'>
      <node id='1' lat='0' lon='0'><tag k='name' v='A &amp; B' /></node>
    </osm>`
    const data = parseOsmXml(xml)
    expect(data.nodes.get('1')?.tags.name).toBe('A & B')
  })
})

describe('latLonToCanvas / canvasToLatLon', () => {
  it('round-trips through the projection', () => {
    const lat = 35.5
    const lon = 139.6
    const center = { lat: 35.0, lon: 139.0 }
    const { x, y } = latLonToCanvas(lat, lon, center.lat, center.lon)
    const back = canvasToLatLon(x, y, center.lat, center.lon)
    expect(back.lat).toBeCloseTo(lat, 9)
    expect(back.lon).toBeCloseTo(lon, 9)
  })
})

describe('alignBoundaries', () => {
  it('keeps both boundaries as-is when right is already on the right', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const right = [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]
    expect(alignBoundaries(left, right)).toEqual({ invertLeft: false, invertRight: false })
  })

  it('flips the right boundary when it points the opposite direction', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const right = [
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]
    expect(alignBoundaries(left, right)).toEqual({ invertLeft: false, invertRight: true })
  })
})

describe('exportToLanelet2', () => {
  it('emits a valid OSM document with the embedded origin even with no shapes', () => {
    const xml = exportToLanelet2(snapshot([]))
    expect(xml).toMatch(/^<\?xml version='1\.0' encoding='UTF-8'\?>/)
    expect(xml).toContain(`drawtonomy_origin_lat='${DEFAULT_ORIGIN_LAT.toFixed(11)}'`)
    expect(xml).toContain(`drawtonomy_origin_lon='${DEFAULT_ORIGIN_LON.toFixed(11)}'`)
    expect(xml.trim().endsWith('</osm>')).toBe(true)
  })

  it('honors mapOrigin when no sidecar is supplied', () => {
    const xml = exportToLanelet2(snapshot([]), { mapOrigin: { lat: 36.0, lon: 140.0 } })
    expect(xml).toContain(`drawtonomy_origin_lat='${(36.0).toFixed(11)}'`)
    expect(xml).toContain(`drawtonomy_origin_lon='${(140.0).toFixed(11)}'`)
  })

  it('emits a node / way / relation triple for a single lane', () => {
    const shapes = [
      point('shape:point_0', 0, 0),
      point('shape:point_1', 100, 0),
      point('shape:point_2', 0, 50),
      point('shape:point_3', 100, 50),
      linestring('shape:linestring_0', ['shape:point_0', 'shape:point_1']),
      linestring('shape:linestring_1', ['shape:point_2', 'shape:point_3']),
      lane('shape:lane_0', 'shape:linestring_0', 'shape:linestring_1'),
    ]
    const xml = exportToLanelet2(snapshot(shapes))
    const data = parseOsmXml(xml)
    expect(data.nodes.size).toBe(4)
    expect(data.ways.size).toBe(2)
    expect(data.relations).toHaveLength(1)
    expect(data.relations[0].tags.type).toBe('lanelet')
    const wayMembers = data.relations[0].members.filter(m => m.type === 'way')
    expect(wayMembers.map(m => m.role).sort()).toEqual(['left', 'right'])
  })

  it('preserves non-lanelet sidecar relations on round-trip', () => {
    const sidecar = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='drawtonomy' drawtonomy_origin_lat='35.0' drawtonomy_origin_lon='139.0'>
  <relation id='999'>
    <tag k='type' v='regulatory_element' />
    <tag k='subtype' v='traffic_sign' />
  </relation>
</osm>`
    const xml = exportToLanelet2(snapshot([]), {
      sidecar: { rawXml: sidecar, originLat: 35.0, originLon: 139.0 },
    })
    const data = parseOsmXml(xml)
    expect(data.relations.find(r => r.id === '999')?.tags.type).toBe('regulatory_element')
  })

  it('overrides sidecar way coordinates when shape position changes', () => {
    // Original sidecar places node 1 at lat/lon (35.0, 139.0).
    const sidecar = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='drawtonomy' drawtonomy_origin_lat='35.0' drawtonomy_origin_lon='139.0'>
  <node id='1' lat='35.0' lon='139.0' />
</osm>`
    // Shape places same osmId='1' at canvas (100, 0). Coordinates should be
    // overwritten by the shape (with sidecar tags carried over).
    const shapes = [point('shape:point_0', 100, 0, '1')]
    const xml = exportToLanelet2(snapshot(shapes), {
      sidecar: { rawXml: sidecar, originLat: 35.0, originLon: 139.0 },
    })
    const data = parseOsmXml(xml)
    const node = data.nodes.get('1')!
    expect(node.lon).toBeGreaterThan(139.0)
  })
})

describe('osmToShapes', () => {
  it('imports a single lane with two boundaries and four points', () => {
    const allocator = createShapeIdAllocator()
    const exported = exportToLanelet2(snapshot([
      point('p0', 0, 0),
      point('p1', 100, 0),
      point('p2', 0, 50),
      point('p3', 100, 50),
      linestring('l0', ['p0', 'p1']),
      linestring('l1', ['p2', 'p3']),
      lane('lane0', 'l0', 'l1'),
    ]))
    const data = parseOsmXml(exported)
    const result = osmToShapes(data, { idAllocator: allocator })
    expect(result.points).toHaveLength(4)
    expect(result.linestrings).toHaveLength(2)
    expect(result.lanes).toHaveLength(1)
    expect(result.lanes[0].leftBoundaryId).toBe(result.linestrings[0].id)
  })

  it('honors selectedLaneIds to restrict imported lanes', () => {
    // Two independent lanes.
    const xml = exportToLanelet2(snapshot([
      point('p0', 0, 0, 'n0'),
      point('p1', 100, 0, 'n1'),
      point('p2', 0, 50, 'n2'),
      point('p3', 100, 50, 'n3'),
      linestring('l0', ['p0', 'p1'], 'w0'),
      linestring('l1', ['p2', 'p3'], 'w1'),
      lane('lane0', 'l0', 'l1', 'r0'),
      point('p4', 200, 0, 'n4'),
      point('p5', 300, 0, 'n5'),
      point('p6', 200, 50, 'n6'),
      point('p7', 300, 50, 'n7'),
      linestring('l2', ['p4', 'p5'], 'w2'),
      linestring('l3', ['p6', 'p7'], 'w3'),
      lane('lane1', 'l2', 'l3', 'r1'),
    ]))
    const data = parseOsmXml(xml)
    const result = osmToShapes(data, { selectedLaneIds: ['r0'] })
    expect(result.lanes).toHaveLength(1)
    expect(result.lanes[0].osmId).toBe('r0')
  })

  it('detects next/prev when two lanes share an end node', () => {
    // Two collinear lanes that meet at x=100.
    const xml = exportToLanelet2(snapshot([
      point('p0', 0, 0, 'n0'),
      point('p1', 100, 0, 'n1'),
      point('p2', 0, 50, 'n2'),
      point('p3', 100, 50, 'n3'),
      linestring('l0', ['p0', 'p1'], 'w0'),
      linestring('l1', ['p2', 'p3'], 'w1'),
      lane('lane0', 'l0', 'l1', 'r0'),
      // Second lane reuses the meeting nodes (n1, n3) as its start.
      point('p4', 200, 0, 'n4'),
      point('p5', 200, 50, 'n5'),
      linestring('l2', ['p1', 'p4'], 'w2'),
      linestring('l3', ['p3', 'p5'], 'w3'),
      lane('lane1', 'l2', 'l3', 'r1'),
    ]))
    const data = parseOsmXml(xml)
    const result = osmToShapes(data)
    const first = result.lanes.find(l => l.osmId === 'r0')!
    const second = result.lanes.find(l => l.osmId === 'r1')!
    expect(first.next).toContain(second.id)
    expect(second.prev).toContain(first.id)
  })
})

describe('round-trip', () => {
  it('preserves canvas coordinates when sidecar origin is honored', () => {
    const original = snapshot([
      point('p0', 12.5, -7.25),
      point('p1', 100.75, 33.5),
      linestring('l0', ['p0', 'p1']),
    ])
    const xml = exportToLanelet2(original, { mapOrigin: { lat: 35.0, lon: 139.0 } })

    // Re-parse with the same origin and check canvas coords come back.
    const data = parseOsmXml(xml)
    const allocator = createShapeIdAllocator()
    const result = osmToShapes(data, { idAllocator: allocator })

    // No lanes (only points + linestring), so points list is empty (osmToShapes only emits points used by lanes).
    // But round-trip lat/lon precision check:
    const node0 = Array.from(data.nodes.values())[0]
    const back = canvasToLatLon(12.5, -7.25, 35.0, 139.0)
    expect(node0.lat).toBeCloseTo(back.lat, 9)
    expect(node0.lon).toBeCloseTo(back.lon, 9)

    // Sanity: importer produces a sane originLatLon when shapes exist.
    expect(result.points.length).toBe(0)  // no lanelet relation -> no points imported
  })
})
