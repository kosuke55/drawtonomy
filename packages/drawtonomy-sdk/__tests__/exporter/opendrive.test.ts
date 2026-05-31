import { describe, it, expect } from 'vitest'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import type { DrawtonomySnapshot } from '../../src/types'

function snapshot(
  shapes: any[],
  origin?: DrawtonomySnapshot['origin']
): DrawtonomySnapshot {
  const s: DrawtonomySnapshot = { version: '1.1', timestamp: new Date().toISOString(), shapes }
  if (origin) s.origin = origin
  return s
}

function point(id: string, x: number, y: number) {
  return { id, type: 'point', x, y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } }
}

function linestring(id: string, pointIds: string[]) {
  return {
    id,
    type: 'linestring',
    x: 0,
    y: 0,
    rotation: 0,
    zIndex: 0,
    props: { pointIds, color: 'black', strokeWidth: 2, attributes: {}, osmId: '' },
  }
}

function lane(id: string, leftId: string, rightId: string, opts: any = {}) {
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
      next: opts.next ?? [],
      prev: opts.prev ?? [],
      osmId: '',
    },
  }
}

describe('exportToOpenDrive', () => {
  it('emits a valid OpenDRIVE 1.8 header even with no lanes', () => {
    const xml = exportToOpenDrive(snapshot([]))
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`)
    expect(xml).toContain(`<OpenDRIVE>`)
    expect(xml).toContain(`revMajor="1"`)
    expect(xml).toContain(`revMinor="8"`)
    expect(xml).toContain(`</OpenDRIVE>`)
  })

  it('emits one road per lane with planView and lanes sections', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain(`<road `)
    expect(xml).toContain(`id="1"`)
    expect(xml).toContain(`<planView>`)
    expect(xml).toContain(`<line/>`)
    expect(xml).toContain(`<lanes>`)
    expect(xml).toContain(`<laneSection s="0">`)
    expect(xml).toContain(`<center>`)
    expect(xml).toContain(`<left>`)
    expect(xml).toContain(`<right>`)
  })

  it('converts pixels to meters using PIXELS_PER_METER (16.67)', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    const m = xml.match(/length="([\d.]+)"/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeCloseTo(5.999, 1)
  })

  it('inverts y axis to match OpenDRIVE math coordinates', () => {
    const shapes = [
      point('p1', 0, 100), point('p2', 100, 100),
      point('p3', 0, 110), point('p4', 100, 110),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    const yMatch = xml.match(/y="(-?[\d.]+)"/)
    expect(yMatch).not.toBeNull()
    expect(parseFloat(yMatch![1])).toBeLessThan(0)
  })

  it('writes successor/predecessor links between connected lanes (road and lane level)', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('l1l', ['p1', 'p2']),
      linestring('l1r', ['p3', 'p4']),
      lane('lane1', 'l1l', 'l1r', { next: ['lane2'] }),
      point('p5', 100, -5), point('p6', 200, -5),
      point('p7', 100, 5), point('p8', 200, 5),
      linestring('l2l', ['p5', 'p6']),
      linestring('l2r', ['p7', 'p8']),
      lane('lane2', 'l2l', 'l2r', { prev: ['lane1'] }),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain(`<successor elementType="road" elementId="2"`)
    expect(xml).toContain(`<predecessor elementType="road" elementId="1"`)
    expect(xml).toContain(`<successor id="1"/>`)
    expect(xml).toContain(`<successor id="-1"/>`)
    expect(xml).toContain(`<predecessor id="1"/>`)
    expect(xml).toContain(`<predecessor id="-1"/>`)
  })

  it('exports a TrafficLight near a lane as <signal>', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
      {
        id: 'tl1',
        type: 'traffic_light',
        x: 100, y: -20, rotation: 0, zIndex: 0,
        props: { w: 30, h: 60, color: 'black', style: 'pedestrian', activeLight: 'all', size: 'm', attributes: {}, osmId: '' },
      },
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain('<signals>')
    expect(xml).toContain('<signal ')
    expect(xml).toContain('type="1000002"') // pedestrian signal
    expect(xml).toContain('dynamic="yes"')
  })

  it('exports a Polygon near a lane as <object type="patch"> with outline', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
      point('pp1', 40, -10), point('pp2', 60, -10),
      point('pp3', 60, 10), point('pp4', 40, 10),
      {
        id: 'poly1',
        type: 'polygon',
        x: 0, y: 0, rotation: 0, zIndex: 0,
        props: {
          pointIds: ['pp1', 'pp2', 'pp3', 'pp4'],
          color: 'grey-500',
          strokeWidth: 2,
          fillOpacity: null,
          attributes: { type: 'polygon' },
          osmId: '',
        },
      },
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain('<objects>')
    expect(xml).toContain('type="patch"')
    expect(xml).toContain('<outlines>')
    expect(xml).toContain('<outline ')
    expect(xml).toContain('<cornerLocal ')
    const cornerCount = (xml.match(/<cornerLocal /g) || []).length
    expect(cornerCount).toBe(4)
  })

  it('exports a Crosswalk near a lane as <object type="crosswalk">', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
      {
        id: 'cw1',
        type: 'crosswalk',
        x: 50, y: 0, rotation: 0, zIndex: 0,
        props: {
          startX: 0, startY: -10, endX: 0, endY: 10,
          stripeWidth: 5, stripeSpacing: 5, crosswalkWidth: 40,
          color: 'white', attributes: { type: 'crosswalk', subtype: 'zebra' }, osmId: '',
        },
      },
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).toContain('<objects>')
    expect(xml).toContain('<object ')
    expect(xml).toContain('type="crosswalk"')
  })

  it('emits empty <link/> for lanes without next/prev', () => {
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5),
      point('p3', 0, 5), point('p4', 100, 5),
      linestring('left', ['p1', 'p2']),
      linestring('right', ['p3', 'p4']),
      lane('lane1', 'left', 'right'),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).not.toContain(`<successor id=`)
    expect(xml).not.toContain(`<predecessor id=`)
  })

  it('skips lanes with missing boundary references', () => {
    const shapes = [
      lane('lane1', 'missingL', 'missingR'),
    ]
    const xml = exportToOpenDrive(snapshot(shapes))
    expect(xml).not.toContain(`<road `)
    expect(xml).toContain(`</OpenDRIVE>`)
  })

  describe('<header><geoReference>', () => {
    it('emits a <geoReference> child of <header>', () => {
      const xml = exportToOpenDrive(snapshot([]))
      expect(xml).toMatch(/<header\b[^>]*>[\s\S]*<\/header>/)
      expect(xml).toContain(`<geoReference>`)
      expect(xml).toContain(`</geoReference>`)
    })

    it('embeds tmerc PROJ.4 when snapshot.origin is provided', () => {
      const xml = exportToOpenDrive(
        snapshot([], { lat: 35.6280, lon: 139.7400 })
      )
      expect(xml).toContain(`+proj=tmerc`)
      expect(xml).toContain(`+lat_0=35.62800000`)
      expect(xml).toContain(`+lon_0=139.74000000`)
      expect(xml).toContain(`+datum=WGS84`)
    })

    it('falls back to longlat WGS84 when origin is absent', () => {
      const xml = exportToOpenDrive(snapshot([]))
      expect(xml).toContain(`+proj=longlat`)
      expect(xml).toContain(`+datum=WGS84`)
    })

    it('wraps the PROJ string in CDATA so + characters are preserved', () => {
      const xml = exportToOpenDrive(
        snapshot([], { lat: 0, lon: 0 })
      )
      expect(xml).toMatch(/<geoReference><!\[CDATA\[\+proj=/)
    })
  })

  describe('<header> bbox attributes', () => {
    it('populates north/south/east/west from point shapes in ENU metres', () => {
      const shapes = [
        point('p1', 0, 0),
        point('p2', 167, 0), // 167 px ≈ 10 m east
        point('p3', 0, 167), // 167 px down in canvas ≈ 10 m south in ENU
      ]
      const xml = exportToOpenDrive(snapshot(shapes))
      // west = 0, east ≈ 10 (167 / 16.67 = 10.018),
      // north = 0 (smallest y in canvas = highest in ENU),
      // south ≈ -10 (largest y in canvas = lowest in ENU)
      expect(xml).toMatch(/west="0(?:\.0+)?"/)
      expect(xml).toMatch(/east="10\.0\d+"/)
      expect(xml).toMatch(/north="0(?:\.0+)?"/)
      expect(xml).toMatch(/south="-10\.0\d+"/)
    })

    it('emits zero bbox when there are no point shapes', () => {
      const xml = exportToOpenDrive(snapshot([]))
      // bbox values are formatted by the same `fmt()` helper as other floats,
      // so they appear as "0" / "0.000000" depending on the formatter. The
      // important property is that all four values are numerically zero.
      expect(xml).toMatch(/north="0(?:\.0+)?"/)
      expect(xml).toMatch(/south="0(?:\.0+)?"/)
      expect(xml).toMatch(/east="0(?:\.0+)?"/)
      expect(xml).toMatch(/west="0(?:\.0+)?"/)
    })
  })
})
