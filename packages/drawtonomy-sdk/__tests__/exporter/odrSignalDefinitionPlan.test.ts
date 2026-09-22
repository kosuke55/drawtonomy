// One signal shape, one <signal> definition in the output.
//
// A signal is DEFINED on one road and APPLIED to lanes, possibly of other
// roads (as <signalReference>). Carry-through and regeneration are two
// separate emission paths, and a signal shape can fall into both at once:
// its defining road stays carried while an applied road regenerates.
//
// "Consumed" (skip regeneration) is decided per shape, so the two paths have
// to agree at the level of the DEFINITION, not of the shape. Requiring every
// road the shape touches to be clean meant an edit to an applied road put the
// shape back into regeneration while the carried definition still stood: the
// same light came out twice, under two ids, at two positions, with two
// orientations.

import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { snapshotFrom } from './helpers/snapshotFrom'

/**
 * A lane-less connecting road (32) that DEFINES light 500, applied to a lane
 * of road 31, which references it. Editing road 31 is what puts the shape
 * back into regeneration while road 32 stays carried.
 */
const MICRO_SIGNAL_XODR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="microsignal">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="west_approach" length="40" id="31" junction="-1">
    <link><successor elementType="junction" elementId="100"/></link>
    <planView><geometry s="0" x="100" y="0" hdg="0" length="40"><line/></geometry></planView>
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
      <signalReference id="500" s="20" t="-1" orientation="-">
        <validity fromLane="-1" toLane="-1"/>
      </signalReference>
    </signals>
  </road>
  <road name="east_departure" length="40" id="33" junction="-1">
    <link><predecessor elementType="junction" elementId="100"/></link>
    <planView><geometry s="0" x="180" y="0" hdg="0" length="40"><line/></geometry></planView>
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
  <road name="micro" length="0.2" id="32" junction="100">
    <link>
      <predecessor elementType="road" elementId="31" contactPoint="end"/>
      <successor elementType="road" elementId="33" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="140" y="20" hdg="0" length="0.2"><line/></geometry></planView>
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
    <signals>
      <signal s="0.1" t="-1" id="500" name="L500" dynamic="yes" orientation="-" zOffset="5" country="OpenDRIVE" type="1000001" subtype="-1" hOffset="0" pitch="0" roll="0" height="1.2" width="0.6">
        <validity fromLane="-1" toLane="-1"/>
      </signal>
    </signals>
  </road>
  <road name="conn_a" length="20" id="40" junction="100">
    <link>
      <predecessor elementType="road" elementId="31" contactPoint="end"/>
      <successor elementType="road" elementId="33" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="140" y="0" hdg="0" length="20"><line/></geometry></planView>
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
  <junction name="main_junction" id="100">
    <connection id="0" incomingRoad="31" connectingRoad="40" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>
    <connection id="1" incomingRoad="31" connectingRoad="32" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>
  </junction>
</OpenDRIVE>`

/** Every `<signal id>` defined anywhere in the document. */
const definitionIds = (xml: string): string[] => {
  const ids: string[] = []
  for (const block of xml.match(/<signal\b[^>]*?(?:\/>|>[\s\S]*?<\/signal>)/g) ?? []) {
    const id = block.slice(0, block.indexOf('>') + 1).match(/\bid="([^"]*)"/)?.[1]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/** Every `<signalReference id>` in the document. */
const referenceIds = (xml: string): string[] => {
  const ids: string[] = []
  for (const tag of xml.match(/<signalReference\b[^>]*?(?:\/>|>)/g) ?? []) {
    const id = tag.match(/\bid="([^"]*)"/)?.[1]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/** The opening tag of the `<signal>` with this id. */
const definitionTag = (xml: string, id: string): string => {
  for (const block of xml.match(/<signal\b[^>]*?(?:\/>|>[\s\S]*?<\/signal>)/g) ?? []) {
    const open = block.slice(0, block.indexOf('>') + 1)
    if (open.match(/\bid="([^"]*)"/)?.[1] === id) return open
  }
  return ''
}

describe('one signal shape, one definition', () => {
  it('does not re-define a carried signal when a road it applies to regenerates', () => {
    const imported = odrToShapes(parseOpenDriveXml(MICRO_SIGNAL_XODR))
    // The defining road has no lane shapes, so it can only ever be carried.
    expect(imported.sidecar.roadRecords!['32'].laneShapeIds).toEqual([])
    const light = imported.trafficLights.find(t => t.attributes.odr_signal_id === '500')
    expect(light).toBeDefined()

    // Edit the APPLIED road only; the light itself is untouched.
    const lane = imported.lanes.find(
      l => l.id === imported.sidecar.roadRecords!['31'].laneShapeIds[0]
    )!
    lane.attributes = { ...(lane.attributes ?? {}), speed_limit: '37' }

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

    // Exactly one definition, and it is the carried one: same id, same
    // placement and orientation as the source said.
    expect(definitionIds(out)).toEqual(['500'])
    const tag = definitionTag(out, '500')
    expect(tag).toMatch(/\bs="0.1"/)
    expect(tag).toMatch(/\bt="-1"/)
    expect(tag).toMatch(/\borientation="-"/)

    // The regenerated road applies it by reference to the id that exists.
    expect(referenceIds(out)).toEqual(['500'])

    // And the reference really sits on the regenerated road, aimed at its lane.
    const roads = out.match(/<road\b[^>]*?>[\s\S]*?<\/road>/g) ?? []
    const applied = roads.find(r => r.includes('<signalReference'))!
    expect(applied).not.toMatch(/\bname="micro"/)
    expect(applied).toMatch(/<validity\b[^>]*\bfromLane="-1"[^>]*\btoLane="-1"/)
  })
})
