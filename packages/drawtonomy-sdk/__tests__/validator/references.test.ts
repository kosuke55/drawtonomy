// Layer 2 unit tests: reference integrity.

import { describe, it, expect } from 'vitest'
import { validateOpenDrive } from '../../src/validator/index'
import type { OdrFinding } from '../../src/validator/index'
import { readFixture } from './corpus'

const findingsFor = (xml: string): OdrFinding[] => validateOpenDrive(xml).findings
const rulesFor = (xml: string): string[] => findingsFor(xml).map(f => f.rule)

/** Two straight roads linked end-to-start, with one lane each side. */
const lanes = (predId?: number, succId?: number): string => `
      <lanes>
        <laneSection s="0">
          <left><lane id="1" type="driving" level="false">
            <link>${predId !== undefined ? `<predecessor id="${predId}"/>` : ''}${succId !== undefined ? `<successor id="${succId}"/>` : ''}</link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane></left>
          <center><lane id="0" type="none" level="false"/></center>
          <right><lane id="-1" type="driving" level="false">
            <link>${predId !== undefined ? `<predecessor id="${-predId}"/>` : ''}${succId !== undefined ? `<successor id="${-succId}"/>` : ''}</link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane></right>
        </laneSection>
      </lanes>`

const PAIR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="100" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    ${lanes(undefined, 1)}
  </road>
  <road name="b" length="100" id="2" junction="-1">
    <link><predecessor elementType="road" elementId="1" contactPoint="end"/></link>
    <planView><geometry s="0" x="100" y="0" hdg="0" length="100"><line/></geometry></planView>
    ${lanes(1, undefined)}
  </road>
</OpenDRIVE>`

describe('checkReferences', () => {
  it('accepts a well-formed pair of linked roads', () => {
    expect(rulesFor(PAIR)).toEqual([])
  })

  it('flags a road link to a nonexistent road', () => {
    const xml = PAIR.replace('elementType="road" elementId="2"', 'elementType="road" elementId="99"')
    expect(rulesFor(xml)).toContain('ref.dangling-road-link')
    expect(validateOpenDrive(xml).verdict).toBe('red')
  })

  it('flags a lane link to a lane the target road does not have', () => {
    const xml = PAIR.replace('<successor id="1"/>', '<successor id="7"/>')
    const found = findingsFor(xml).filter(f => f.rule === 'ref.dangling-lane-link')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('lane 7')
    expect(found[0].location?.roadId).toBe('1')
  })

  it('flags a duplicate road id', () => {
    const xml = PAIR.replace('id="2" junction="-1"', 'id="1" junction="-1"')
    expect(rulesFor(xml)).toContain('ref.duplicate-road-id')
  })

  it('flags a junction connection referring to a missing road', () => {
    const xml = PAIR.replace(
      '</OpenDRIVE>',
      `<junction id="5" name="j">
         <connection id="0" incomingRoad="404" connectingRoad="2" contactPoint="start">
           <laneLink from="-1" to="-1"/>
         </connection>
       </junction></OpenDRIVE>`
    )
    const found = findingsFor(xml).filter(f => f.rule === 'ref.dangling-connection-road')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('incomingRoad="404"')
  })

  it('flags a controller governing an undefined signal', () => {
    const xml = PAIR.replace(
      '</OpenDRIVE>',
      `<controller id="9" name="c"><control signalId="ghost" type="x"/></controller></OpenDRIVE>`
    )
    expect(rulesFor(xml)).toContain('ref.dangling-controller-signal')
  })

  it('resolves a controller signal defined on any road', () => {
    const xml = PAIR.replace(
      '<planView><geometry s="0" x="100"',
      '<signals><signal id="s1" s="10" t="-5" type="1000001" subtype="-1" name="" dynamic="yes" orientation="+"/></signals><planView><geometry s="0" x="100"'
    ).replace(
      '</OpenDRIVE>',
      `<controller id="9" name="c"><control signalId="s1" type="x"/></controller></OpenDRIVE>`
    )
    expect(rulesFor(xml)).toEqual([])
  })

  describe('excerpted maps', () => {
    // Cutting one junction out of a city map leaves boundary roads pointing at
    // junctions that were not carried along. That is a property of the excerpt,
    // not a defect of the map, so it is a warning: worth surfacing, never red.
    it('warns rather than errors on a link to an absent junction', () => {
      const xml = PAIR.replace(
        'elementType="road" elementId="2" contactPoint="start"',
        'elementType="junction" elementId="77"'
      )
      const found = findingsFor(xml).filter(f => f.rule === 'ref.unresolved-junction-link')
      expect(found).toHaveLength(1)
      expect(found[0].severity).toBe('warning')
      expect(validateOpenDrive(xml).verdict).toBe('yellow')
    })

    it('keeps the Town04 slice fixture out of the red', () => {
      const report = validateOpenDrive(readFixture('town04-junction106.xodr'))
      expect(report.verdict).toBe('yellow')
      expect(report.findings.every(f => f.rule === 'ref.unresolved-junction-link')).toBe(true)
      expect(report.counts.error).toBe(0)
    })
  })

  describe('multi-section lane links', () => {
    // Within a road, a lane's successor names a lane of the *next* lane
    // section, not of the linked road. Getting this wrong would redden every
    // multi-section map in existence.
    const twoSections = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="200" id="1" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="200"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <center><lane id="0" type="none" level="false"/></center>
        <right><lane id="-1" type="driving" level="false">
          <link><successor id="-2"/></link>
          <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
        </lane></right>
      </laneSection>
      <laneSection s="100">
        <center><lane id="0" type="none" level="false"/></center>
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
          <lane id="-2" type="driving" level="false">
            <link><predecessor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

    it('resolves a lane successor against the next lane section', () => {
      expect(rulesFor(twoSections)).toEqual([])
    })

    it('flags a lane successor absent from the next lane section', () => {
      const xml = twoSections.replace('<successor id="-2"/>', '<successor id="-9"/>')
      expect(rulesFor(xml)).toContain('ref.dangling-lane-link')
    })
  })
})
