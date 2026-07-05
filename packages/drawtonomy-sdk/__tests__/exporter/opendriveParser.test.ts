import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'

const SAMPLE = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="test">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.62614 +lon_0=139.77525 +datum=WGS84]]></geoReference>
  </header>
  <road name="main" length="100.0" id="1" junction="-1">
    <link>
      <successor elementType="junction" elementId="10"/>
    </link>
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="40"><line/></geometry>
      <geometry s="40" x="40" y="0" hdg="0" length="20"><arc curvature="0.05"/></geometry>
      <geometry s="60" x="58" y="9" hdg="1.0" length="20"><spiral curvStart="0.05" curvEnd="0"/></geometry>
      <geometry s="80" x="70" y="25" hdg="1.0" length="15">
        <paramPoly3 aU="0" bU="1" cU="0" dU="0" aV="0" bV="0" cV="0.001" dV="0" pRange="arcLength"/>
      </geometry>
      <geometry s="95" x="73" y="30" hdg="1.0" length="5"><poly3 a="0" b="0" c="0.002" d="0"/></geometry>
    </planView>
    <elevationProfile>
      <elevation s="0" a="2" b="0" c="0" d="0"/>
    </elevationProfile>
    <lanes>
      <laneOffset s="0" a="0.5" b="0" c="0" d="0"/>
      <laneSection s="0">
        <left>
          <lane id="1" type="sidewalk" level="false">
            <width sOffset="0" a="2.0" b="0" c="0" d="0"/>
          </lane>
        </left>
        <center>
          <lane id="0" type="none" level="false">
            <roadMark sOffset="0" type="broken" color="white"/>
          </lane>
        </center>
        <right>
          <lane id="-2" type="driving" level="false">
            <link><successor id="-2"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-1" type="driving" level="false">
            <link><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
            <roadMark sOffset="0" type="solid" color="white"/>
          </lane>
        </right>
      </laneSection>
      <laneSection s="50">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-2" type="driving" level="false">
            <link><predecessor id="-2"/></link>
            <width sOffset="0" a="3.5" b="-0.07" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
    <signals>
      <signal id="sig1" s="95" t="-6" type="1000001" subtype="-1" name="tl"/>
    </signals>
    <objects>
      <object id="obj1" s="90" t="0" type="crosswalk" name="cw"/>
    </objects>
  </road>
  <junction id="10" name="j">
    <connection id="0" incomingRoad="1" connectingRoad="2" contactPoint="start">
      <laneLink from="-1" to="-1"/>
      <laneLink from="-2" to="-1"/>
    </connection>
  </junction>
</OpenDRIVE>`

describe('parseOpenDriveXml', () => {
  it('parses header and geoReference from CDATA', () => {
    const map = parseOpenDriveXml(SAMPLE)
    expect(map.header.revMajor).toBe(1)
    expect(map.header.revMinor).toBe(6)
    expect(map.header.geoReference).toContain('+proj=tmerc')
    expect(map.header.geoReference).toContain('+lat_0=35.62614')
    expect(map.rawXml).toBe(SAMPLE)
  })

  it('parses all five plan-view primitives in s order', () => {
    const road = parseOpenDriveXml(SAMPLE).roads[0]
    expect(road.planView.map(g => g.kind)).toEqual(['line', 'arc', 'spiral', 'paramPoly3', 'poly3'])
    const arc = road.planView[1]
    expect(arc.kind === 'arc' && arc.curvature).toBe(0.05)
    const spiral = road.planView[2]
    expect(spiral.kind === 'spiral' && spiral.curvStart).toBe(0.05)
    const pp = road.planView[3]
    expect(pp.kind === 'paramPoly3' && pp.pRange).toBe('arcLength')
  })

  it('parses road link, lane sections, widths, road marks, and laneOffset', () => {
    const road = parseOpenDriveXml(SAMPLE).roads[0]
    expect(road.successor).toEqual({ elementType: 'junction', elementId: '10', contactPoint: undefined })
    expect(road.laneOffsets).toHaveLength(1)
    expect(road.laneOffsets[0].a).toBe(0.5)
    expect(road.laneSections).toHaveLength(2)

    const sec0 = road.laneSections[0]
    expect(sec0.left.map(l => l.id)).toEqual([1])
    expect(sec0.center.map(l => l.id)).toEqual([0])
    // Right lanes are sorted inner-to-outer (-1 before -2) regardless of
    // document order.
    expect(sec0.right.map(l => l.id)).toEqual([-1, -2])
    expect(sec0.right[0].widths[0].a).toBe(3.5)
    expect(sec0.right[0].roadMarks[0].type).toBe('solid')
    expect(sec0.right[0].successorIds).toEqual([-1])
    expect(sec0.center[0].roadMarks[0].type).toBe('broken')

    const sec1 = road.laneSections[1]
    expect(sec1.s).toBe(50)
    expect(sec1.right[1].widths[0].b).toBeCloseTo(-0.07, 12)
  })

  it('parses roadMark weight/width/material/laneChange when present', () => {
    const xml = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="r" length="10" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="10"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
            <roadMark sOffset="0" type="solid solid" weight="bold" color="yellow" width="0.25" material="custom" laneChange="none"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`
    const rm = parseOpenDriveXml(xml).roads[0].laneSections[0].right[0].roadMarks[0]
    expect(rm.type).toBe('solid solid')
    expect(rm.weight).toBe('bold')
    expect(rm.color).toBe('yellow')
    expect(rm.width).toBeCloseTo(0.25, 6)
    expect(rm.material).toBe('custom')
    expect(rm.laneChange).toBe('none')
  })

  it('flags elevation and keeps minimal signal/object records', () => {
    const road = parseOpenDriveXml(SAMPLE).roads[0]
    expect(road.hasElevation).toBe(true)
    expect(road.signals).toEqual([
      { id: 'sig1', s: 95, t: -6, type: '1000001', subtype: '-1', name: 'tl', dynamic: '', country: '', width: 0, height: 0, validity: [], userData: {} },
    ])
    expect(road.objects[0].type).toBe('crosswalk')
  })

  it('parses junction connections with laneLinks', () => {
    const junction = parseOpenDriveXml(SAMPLE).junctions[0]
    expect(junction.id).toBe('10')
    expect(junction.connections).toHaveLength(1)
    const conn = junction.connections[0]
    expect(conn.incomingRoad).toBe('1')
    expect(conn.connectingRoad).toBe('2')
    expect(conn.contactPoint).toBe('start')
    expect(conn.laneLinks).toEqual([
      { from: -1, to: -1 },
      { from: -2, to: -1 },
    ])
  })

  it('throws with road context on malformed required attributes', () => {
    const bad = `<OpenDRIVE><header revMajor="1" revMinor="6"/><road id="7" length="abc"/></OpenDRIVE>`
    expect(() => parseOpenDriveXml(bad)).toThrow(/road 7/)
  })

  it('throws when the root element is missing', () => {
    expect(() => parseOpenDriveXml('<notOpenDrive/>')).toThrow(/OpenDRIVE/)
  })
})

// Junction records are topology metadata: a malformed <connection> must not
// fail the whole document (which would prevent every road from rendering).
const junctionXml = (connections: string) => `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="7"/>
  <road name="a" length="50" id="1" junction="-1">
    <link><successor elementType="junction" elementId="8"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes><laneSection s="0"><right>
      <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
    </right></laneSection></lanes>
  </road>
  <road name="b" length="50" id="2" junction="-1">
    <link><predecessor elementType="junction" elementId="8"/></link>
    <planView><geometry s="0" x="50" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes><laneSection s="0"><right>
      <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
    </right></laneSection></lanes>
  </road>
  <junction id="8" name="j">${connections}</junction>
</OpenDRIVE>`

describe('junction connection tolerance', () => {
  it('parses a direct connection that uses linkedRoad instead of connectingRoad', () => {
    const map = parseOpenDriveXml(
      junctionXml(`<connection id="0" type="direct" incomingRoad="1" linkedRoad="2" contactPoint="start">
        <laneLink from="-1" to="-1"/>
      </connection>`)
    )
    expect(map.warnings).toEqual([])
    const conn = map.junctions[0].connections[0]
    expect(conn.connectingRoad).toBe('2')
    expect(conn.linkedRoad).toBe('2')
    expect(conn.type).toBe('direct')
    expect(conn.laneLinks).toEqual([{ from: -1, to: -1 }])
  })

  it('skips a connection missing both connectingRoad and linkedRoad, with a warning', () => {
    const map = parseOpenDriveXml(
      junctionXml(`<connection id="0" incomingRoad="1" contactPoint="start">
        <laneLink from="-1" to="-1"/>
      </connection>
      <connection id="1" incomingRoad="1" connectingRoad="2" contactPoint="start">
        <laneLink from="-1" to="-1"/>
      </connection>`)
    )
    // The broken connection is dropped; the healthy sibling survives.
    expect(map.junctions[0].connections).toHaveLength(1)
    expect(map.junctions[0].connections[0].connectingRoad).toBe('2')
    expect(map.warnings).toHaveLength(1)
    expect(map.warnings[0]).toMatch(/Junction 8, connection 0/)
    expect(map.warnings[0]).toMatch(/connectingRoad\/linkedRoad/)
  })

  it('skips a connection missing incomingRoad, with a warning', () => {
    const map = parseOpenDriveXml(
      junctionXml(`<connection id="0" connectingRoad="2" contactPoint="start"/>`)
    )
    expect(map.junctions[0].connections).toHaveLength(0)
    expect(map.warnings).toHaveLength(1)
    expect(map.warnings[0]).toMatch(/missing "incomingRoad"/)
  })

  it('skips malformed laneLink records without dropping the connection', () => {
    const map = parseOpenDriveXml(
      junctionXml(`<connection id="0" incomingRoad="1" connectingRoad="2" contactPoint="start">
        <laneLink from="-1"/>
        <laneLink from="-1" to="-1"/>
      </connection>`)
    )
    const conn = map.junctions[0].connections[0]
    expect(conn.laneLinks).toEqual([{ from: -1, to: -1 }])
    expect(map.warnings).toHaveLength(1)
    expect(map.warnings[0]).toMatch(/laneLink/)
  })

  it('keeps classic connectingRoad connections warning-free (regression)', () => {
    const map = parseOpenDriveXml(SAMPLE)
    expect(map.warnings).toEqual([])
    expect(map.junctions[0].connections[0].connectingRoad).toBe('2')
    expect(map.junctions[0].connections[0].linkedRoad).toBeUndefined()
  })
})
