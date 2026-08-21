// Layer 3 unit tests: junction consistency.

import { describe, it, expect } from 'vitest'
import { validateOpenDrive } from '../../src/validator/index'
import type { OdrFinding } from '../../src/validator/index'
import { readFixture } from './corpus'

const findingsFor = (xml: string): OdrFinding[] => validateOpenDrive(xml).findings
const rulesFor = (xml: string): string[] => findingsFor(xml).map(f => f.rule)

const lane = (id: number): string =>
  `<lane id="${id}" type="${id === 0 ? 'none' : 'driving'}" level="false">${id === 0 ? '' : '<width sOffset="0" a="3.5" b="0" c="0" d="0"/>'}</lane>`

const laneBlock = `
      <lanes><laneSection s="0">
        <left>${lane(1)}</left><center>${lane(0)}</center><right>${lane(-1)}</right>
      </laneSection></lanes>`

/**
 * Two mainlines meeting at junction 5 through connecting road 3.
 * Road 1 -> (junction 5, via connecting road 3) -> road 2.
 */
const JUNCTION = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="in" length="100" id="1" junction="-1">
    <link><successor elementType="junction" elementId="5"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    ${laneBlock}
  </road>
  <road name="out" length="100" id="2" junction="-1">
    <link><predecessor elementType="junction" elementId="5"/></link>
    <planView><geometry s="0" x="120" y="0" hdg="0" length="100"><line/></geometry></planView>
    ${laneBlock}
  </road>
  <road name="conn" length="20" id="3" junction="5">
    <link>
      <predecessor elementType="road" elementId="1" contactPoint="end"/>
      <successor elementType="road" elementId="2" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="100" y="0" hdg="0" length="20"><line/></geometry></planView>
    ${laneBlock}
  </road>
  <junction name="j" id="5">
    <connection id="0" incomingRoad="1" connectingRoad="3" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>
    <connection id="1" incomingRoad="2" connectingRoad="3" contactPoint="end">
      <laneLink from="1" to="1"/>
    </connection>
  </junction>
</OpenDRIVE>`

describe('checkJunctions', () => {
  it('accepts a well-formed junction', () => {
    expect(rulesFor(JUNCTION)).toEqual([])
  })

  it('flags a junction with no connections', () => {
    const xml = JUNCTION.replace(/<connection[\s\S]*?<\/connection>/g, '')
    expect(rulesFor(xml)).toContain('junction.empty')
  })

  it('reports a deleted connection once, as connection-missing', () => {
    // Add a second connecting road (4) so the junction keeps a connection
    // after road 3's is deleted, then delete road 3's connections. Road 3
    // still declares junction="5" and still links to roads 1 and 2, so the
    // lost half is the connection record, not the membership claim.
    const withSecond = JUNCTION.replace(
      '</junction>',
      `<connection id="2" incomingRoad="1" connectingRoad="4" contactPoint="start">
         <laneLink from="-1" to="-1"/>
       </connection></junction>`
    ).replace(
      '</OpenDRIVE>',
      `<road name="conn2" length="20" id="4" junction="5">
         <link>
           <predecessor elementType="road" elementId="1" contactPoint="end"/>
           <successor elementType="road" elementId="2" contactPoint="start"/>
         </link>
         <planView><geometry s="0" x="100" y="8" hdg="0" length="20"><line/></geometry></planView>
         ${laneBlock}
       </road></OpenDRIVE>`
    )
    expect(rulesFor(withSecond)).toEqual([])

    const stripped = withSecond
      .replace(/<connection id="0"[\s\S]*?<\/connection>/, '')
      .replace(/<connection id="1"[\s\S]*?<\/connection>/, '')
    const found = findingsFor(stripped).filter(f => f.rule.startsWith('junction.'))
    const missing = found.filter(f => f.rule === 'junction.connection-missing')
    expect(missing).toHaveLength(1)
    expect(missing[0].location?.roadId).toBe('3')
    // The mirror rule must NOT also fire: one defect, one finding.
    expect(found.filter(f => f.rule === 'junction.road-not-member')).toHaveLength(0)
  })

  it('reports a spurious membership claim as road-not-member', () => {
    // A road that names the junction but links to none of its roads.
    const xml = JUNCTION.replace(
      '</OpenDRIVE>',
      `<road name="stray" length="50" id="9" junction="5">
         <planView><geometry s="0" x="500" y="500" hdg="0" length="50"><line/></geometry></planView>
         ${laneBlock}
       </road></OpenDRIVE>`
    )
    const found = findingsFor(xml).filter(f => f.rule.startsWith('junction.'))
    expect(found.map(f => f.rule)).toEqual(['junction.road-not-member'])
    expect(found[0].location?.roadId).toBe('9')
  })

  it('flags a connecting road that does not declare its junction', () => {
    const xml = JUNCTION.replace('id="3" junction="5"', 'id="3" junction="-1"')
    expect(rulesFor(xml)).toContain('junction.connecting-road-unmarked')
  })

  it('flags an incoming road that never links to the junction', () => {
    const xml = JUNCTION.replace('<link><successor elementType="junction" elementId="5"/></link>', '')
    expect(rulesFor(xml)).toContain('junction.incoming-link-missing')
  })

  it('flags a contactPoint that disagrees with the connecting road link', () => {
    // Connection 0 says the connecting road meets road 1 at its start, so road
    // 3's predecessor must be road 1. Point it elsewhere.
    const xml = JUNCTION.replace(
      '<predecessor elementType="road" elementId="1" contactPoint="end"/>',
      '<predecessor elementType="road" elementId="2" contactPoint="end"/>'
    )
    expect(rulesFor(xml)).toContain('junction.contact-point-mismatch')
  })

  describe('direct junctions', () => {
    // <junction type="direct"> has no connecting road: linkedRoad names an
    // ordinary road that does not carry a junction attribute. The membership
    // and contact-point rules must not fire on it.
    it('accepts the soderleden direct-junction fixture', () => {
      const report = validateOpenDrive(readFixture('soderleden.xodr'))
      expect(report.findings.filter(f => f.rule.startsWith('junction.'))).toEqual([])
    })
  })

  it('does not double-report a junction that layer 2 already flagged as missing', () => {
    // road@junction naming an absent junction is ref.road-junction-unknown;
    // layer 3 must stay quiet about it.
    const xml = JUNCTION.replace('id="3" junction="5"', 'id="3" junction="404"')
    const rules = rulesFor(xml)
    expect(rules).toContain('ref.road-junction-unknown')
    expect(rules).not.toContain('junction.road-not-member')
  })
})
