// A connecting road with no materialized lane shapes, when its junction is
// rebuilt under a new id.
//
// KNOWN LIMITATION. Such a road is below the importer's minimum section
// length, so no lane shape is materialized for it. It therefore has nothing
// to regenerate from, and it is a member of the junction, so rebuilding that
// junction drops it from the output.
//
// Keeping it instead was tried and withdrawn: placing a road that contributes
// no lane edges into a synthesized junction means re-deciding its incoming
// road, its contact point and its lane pairing from the source <connection>,
// and that plan was not integrated with the connectivity plan the rest of the
// intersection is built from. The result was a junction table and a set of
// road links that disagreed about the route. Dropping the road is lossy but
// self-consistent, which is the contract these tests pin: whatever the export
// does with the road, it must not leave a reference to it behind.
//
// What this costs is recorded as a known limitation, not fixed here.

import { describe, it, expect } from 'vitest'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { extractOdrDocument } from '../../src/exporter/odrCarryThrough'
import { snapshotFrom } from './helpers/snapshotFrom'

/**
 * Four mainlines, two connecting roads inside junction 100. Road 32 is the
 * lane-less one (0.2 m long, below the importer's minimum section length);
 * road 40 is a normal connecting road whose lanes DO materialize, so editing
 * it is what forces the junction to be rebuilt.
 */
const BASE_XODR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="laneless">
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

const exportWith = (imported: ImportedShapes): string =>
  exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

/** Drag a road's boundary sideways so it leaves the carry path for real. */
const nudgeRoad = (imported: ImportedShapes, roadId: string, dx: number): void => {
  const laneId = imported.sidecar.roadRecords![roadId].laneShapeIds[0]
  const lane = imported.lanes.find(l => l.id === laneId)!
  const ls = imported.linestrings.find(
    l => l.id === (lane.leftBoundaryId ?? lane.rightBoundaryId)
  )!
  const midPid = ls.pointIds[Math.floor(ls.pointIds.length / 2)]
  imported.points.find(p => p.id === midPid)!.x += dx
}

/** The <connection> of `junctionText` whose connectingRoad is `connecting`. */
const connectionFor = (
  junctionText: string,
  connecting: string
): { incomingRoad: string; contactPoint: string; laneLinks: { from: string; to: string }[] } | null => {
  for (const conn of junctionText.match(/<connection\b[^>]*(?:\/>|>[\s\S]*?<\/connection>)/g) ?? []) {
    const head = conn.slice(0, conn.indexOf('>') + 1)
    if (head.match(/\bconnectingRoad="([^"]*)"/)?.[1] !== connecting) continue
    const laneLinks: { from: string; to: string }[] = []
    for (const link of conn.match(/<laneLink\b[^>]*>/g) ?? []) {
      const from = link.match(/\bfrom="([^"]*)"/)?.[1]
      const to = link.match(/\bto="([^"]*)"/)?.[1]
      if (from !== undefined && to !== undefined) laneLinks.push({ from, to })
    }
    return {
      incomingRoad: head.match(/\bincomingRoad="([^"]*)"/)?.[1] ?? '',
      contactPoint: head.match(/\bcontactPoint="([^"]*)"/)?.[1] ?? '',
      laneLinks,
    }
  }
  return null
}

/**
 * Dropping the lane-less road must take every reference to it along: no
 * surviving road links to it, no junction lists it, and it does not itself
 * survive claiming a junction that is not defined.
 *
 * Scoped to that road on purpose. A carried road whose `<link>` still names a
 * junction that was rebuilt under a new id is a separate, pre-existing gap
 * (present identically on origin/main) and is not what this file pins.
 */
const expectNothingRefers = (out: string, roadId: string): void => {
  const doc = extractOdrDocument(out)!
  const junctionIds = new Set(doc.junctions.map(j => j.id))
  const road = doc.roads.find(r => r.id === roadId)
  if (road !== undefined && road.junction !== '-1') {
    expect(junctionIds.has(road.junction)).toBe(true)
  }
  for (const r of doc.roads) {
    if (r.id === roadId) continue
    expect(r.linkRoadRefs).not.toContain(roadId)
  }
  for (const j of doc.junctions) {
    for (const c of j.connections) {
      expect(c.incomingRoad).not.toBe(roadId)
      expect(c.connectingRoad).not.toBe(roadId)
    }
  }
}

/** The junction a road says it belongs to, from its own attribute. */
const junctionAttrOf = (roadText: string): string =>
  roadText.match(/<road\b[^>]*\bjunction="([^"]*)"/)![1]

describe('lane-less connecting road when its junction is rebuilt', () => {
  // Reproduction A: the road's own links are reversed, so the first neighbour
  // in document order (33, the successor) is not the incoming road, and the
  // original connection says 31 enters at contactPoint="end" pairing lane
  // -1 -> +1. None of that can be carried once the road itself is gone.
  const REVERSED_LINKS_XODR = BASE_XODR.replace(
    /<road name="micro"[\s\S]*?<\/road>/,
    `<road name="micro" length="0.2" id="32" junction="100">
    <link>
      <predecessor elementType="road" elementId="33" contactPoint="start"/>
      <successor elementType="road" elementId="31" contactPoint="end"/>
    </link>
    <planView><geometry s="0" x="140" y="20" hdg="0" length="0.2"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <left>
          <lane id="1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </left>
      </laneSection>
    </lanes>
  </road>`
  ).replace(
    /<connection id="1"[\s\S]*?<\/connection>/,
    `<connection id="1" incomingRoad="31" connectingRoad="32" contactPoint="end">
      <laneLink from="-1" to="1"/>
    </connection>`
  )

  it('drops the road, and its connection with it, when the junction is rebuilt', () => {
    const imported = odrToShapes(parseOpenDriveXml(REVERSED_LINKS_XODR))
    expect(imported.sidecar.roadRecords!['32'].laneShapeIds).toEqual([])
    nudgeRoad(imported, '40', 20)

    const out = exportWith(imported)
    const outDoc = extractOdrDocument(out)!
    // The known limitation itself: the road does not survive the rebuild.
    expect(outDoc.roads.some(r => r.id === '32')).toBe(false)
    // What must hold regardless: nothing is left naming it.
    for (const j of outDoc.junctions) {
      expect(connectionFor(j.text, '32')).toBeNull()
    }
    expectNothingRefers(out, '32')
  })

  // The limitation stated as the behaviour we would want. Kept executable so
  // that a future fix turns this red and has to be un-marked deliberately,
  // rather than the expectation being quietly deleted.
  it.fails(
    'KNOWN LIMITATION: does not keep the road with its original incoming road, contact point and lane links',
    () => {
      const imported = odrToShapes(parseOpenDriveXml(REVERSED_LINKS_XODR))
      nudgeRoad(imported, '40', 20)

      const outDoc = extractOdrDocument(exportWith(imported))!
      const micro = outDoc.roads.find(r => r.id === '32')
      expect(micro).toBeDefined()

      const jid = junctionAttrOf(micro!.text)
      const owner = outDoc.junctions.find(j => j.id === jid)!
      const conn = connectionFor(owner.text, '32')!
      const road31 = outDoc.roads.find(r => r.text.includes('name="west_approach"'))!
      expect(conn.incomingRoad).toBe(road31.id)
      expect(conn.contactPoint).toBe('end')
      expect(conn.laneLinks).toEqual([{ from: '-1', to: '1' }])
    }
  )

  // Reproduction B: the two ends reach DIFFERENT rebuilt junctions, so there
  // is no single "the junction this road belongs to" to fall back on.
  it('leaves no reference behind when its two ends reach different junctions', () => {
    // Mirror the whole layout 1000 m east as junction 200, and make road 32
    // reach across: predecessor into the far side, successor back to 31.
    const far = BASE_XODR.slice(BASE_XODR.indexOf('<road name="west_approach"'))
      .replace(/<\/OpenDRIVE>/, '')
      .replace(/\bid="(\d+)"/g, (_m, d: string) => `id="${parseInt(d, 10) + 100}"`)
      .replace(/\belementId="(\d+)"/g, (_m, d: string) => `elementId="${parseInt(d, 10) + 100}"`)
      .replace(/\bincomingRoad="(\d+)"/g, (_m, d: string) => `incomingRoad="${parseInt(d, 10) + 100}"`)
      .replace(/\bconnectingRoad="(\d+)"/g, (_m, d: string) => `connectingRoad="${parseInt(d, 10) + 100}"`)
      .replace(/\bx="(-?[\d.]+)"/g, (_m, d: string) => `x="${parseFloat(d) + 1000}"`)

    const xml = BASE_XODR.replace(
      /<road name="micro"[\s\S]*?<\/road>/,
      `<road name="micro" length="0.2" id="32" junction="100">
    <link>
      <predecessor elementType="road" elementId="133" contactPoint="start"/>
      <successor elementType="road" elementId="31" contactPoint="end"/>
    </link>
    <planView><geometry s="0" x="140" y="20" hdg="0" length="0.2"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <left>
          <lane id="1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </left>
      </laneSection>
    </lanes>
  </road>`
    )
      .replace(
        /<connection id="1"[\s\S]*?<\/connection>/,
        `<connection id="1" incomingRoad="31" connectingRoad="32" contactPoint="end">
      <laneLink from="-1" to="1"/>
    </connection>`
      )
      .replace(/<\/OpenDRIVE>/, `${far}</OpenDRIVE>`)

    const imported = odrToShapes(parseOpenDriveXml(xml))
    expect(imported.sidecar.roadRecords!['32'].laneShapeIds).toEqual([])
    // Edit both intersections so both get rebuilt under fresh ids.
    nudgeRoad(imported, '40', 20)
    nudgeRoad(imported, '140', 20)

    const out = exportWith(imported)
    const outDoc = extractOdrDocument(out)!
    // Neither intersection adopts it, and neither is left claiming it.
    for (const j of outDoc.junctions) {
      expect(connectionFor(j.text, '32')).toBeNull()
    }
    expectNothingRefers(out, '32')
  })

  // Reproduction C: nothing else lands in a rebuilt junction, so there is no
  // junction to place the road in at all. The old attribute must not survive
  // pointing at an element the output no longer has.
  it('does not leave a road pointing at a junction the output dropped', () => {
    const imported = odrToShapes(parseOpenDriveXml(BASE_XODR))
    expect(imported.sidecar.roadRecords!['32'].laneShapeIds).toEqual([])

    // Cut road 40's lane connectivity: the junction can no longer be carried,
    // and road 40 becomes a plain mainline, so no synthesized junction exists.
    const laneId = imported.sidecar.roadRecords!['40'].laneShapeIds[0]
    const lane = imported.lanes.find(l => l.id === laneId)!
    lane.next = []
    lane.prev = []
    for (const other of imported.lanes) {
      other.next = (other.next ?? []).filter(id => id !== laneId)
      other.prev = (other.prev ?? []).filter(id => id !== laneId)
    }

    const out = exportWith(imported)
    const outDoc = extractOdrDocument(out)!
    const micro = outDoc.roads.find(r => r.id === '32')
    if (micro !== undefined) {
      // If it does survive, whatever junction it claims has to exist.
      const jid = junctionAttrOf(micro.text)
      if (jid !== '-1') {
        expect(outDoc.junctions.some(j => j.id === jid)).toBe(true)
      }
    }
    expectNothingRefers(out, '32')
  })
})
