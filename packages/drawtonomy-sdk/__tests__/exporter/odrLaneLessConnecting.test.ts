// A connecting road with no materialized lane shapes, when its junction is
// rebuilt under a new id.
//
// Such a road cannot regenerate (nothing to build from), so it stays verbatim.
// But the junction it named no longer exists, and because it contributes no
// lane edges the synthesized table does not know about it. Re-pointing it is
// therefore a planning decision, and the only record of what the road did is
// the ORIGINAL <connection>: which road came in, at which end, with which
// contactPoint and which lane pairs.
//
// Picking the first neighbour that happens to land in a rebuilt junction
// throws all four away: it can name the wrong incoming road, it always writes
// contactPoint="start", and it emits an empty <connection>. And when no
// neighbour lands anywhere, the road kept pointing at a junction the output
// had deleted.

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

/** The junction a road says it belongs to, from its own attribute. */
const junctionAttrOf = (roadText: string): string =>
  roadText.match(/<road\b[^>]*\bjunction="([^"]*)"/)![1]

describe('lane-less connecting road when its junction is rebuilt', () => {
  // Reproduction A: the road's own links are reversed, so the FIRST neighbour
  // in document order (33, the successor) is not the incoming road. The
  // original connection says 31 enters at contactPoint="end" pairing lane
  // -1 -> +1. Going by link order names 33, writes contactPoint="start" and
  // emits no laneLink at all.
  it('keeps the original incoming road, contact point and lane links when the links run the other way', () => {
    const xml = BASE_XODR.replace(
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

    const imported = odrToShapes(parseOpenDriveXml(xml))
    expect(imported.sidecar.roadRecords!['32'].laneShapeIds).toEqual([])
    nudgeRoad(imported, '40', 20)

    const outDoc = extractOdrDocument(exportWith(imported))!
    const micro = outDoc.roads.find(r => r.id === '32')
    expect(micro).toBeDefined()

    const jid = junctionAttrOf(micro!.text)
    expect(jid).not.toBe('-1')
    const owner = outDoc.junctions.find(j => j.id === jid)
    expect(owner).toBeDefined()

    const conn = connectionFor(owner!.text, '32')
    expect(conn).not.toBeNull()
    // The incoming road is the one the source named (31), not whichever
    // neighbour the link list mentioned first.
    const road31 = outDoc.roads.find(r => r.text.includes('name="west_approach"'))!
    expect(conn!.incomingRoad).toBe(road31.id)
    expect(conn!.contactPoint).toBe('end')
    expect(conn!.laneLinks).toEqual([{ from: '-1', to: '1' }])
  })

  // Reproduction B: the two ends reach DIFFERENT rebuilt junctions. Going by
  // link order can pick the far end's junction, which relocates the road into
  // an intersection it was never part of.
  it('joins the junction its original connection named when its two ends reach different junctions', () => {
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

    const outDoc = extractOdrDocument(exportWith(imported))!
    const micro = outDoc.roads.find(r => r.id === '32')!
    const jid = junctionAttrOf(micro.text)
    const owner = outDoc.junctions.find(j => j.id === jid)
    expect(owner).toBeDefined()

    const conn = connectionFor(owner!.text, '32')
    expect(conn).not.toBeNull()
    // road 31 is on the near side; the junction road 32 joins must be the one
    // road 31 feeds, not the one its predecessor link reaches.
    const road31 = outDoc.roads.find(r => r.text.includes('name="west_approach"'))!
    expect(conn!.incomingRoad).toBe(road31.id)
    expect(conn!.contactPoint).toBe('end')
    expect(conn!.laneLinks).toEqual([{ from: '-1', to: '1' }])
  })

  // Reproduction C: nothing else lands in a rebuilt junction, so there is no
  // junction to adopt the road into. Leaving the old attribute in place points
  // it at an element the output no longer has.
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

    const outDoc = extractOdrDocument(exportWith(imported))!
    const micro = outDoc.roads.find(r => r.id === '32')
    expect(micro).toBeDefined()

    const jid = junctionAttrOf(micro!.text)
    if (jid !== '-1') {
      // Whatever junction it claims must exist and name it back.
      const owner = outDoc.junctions.find(j => j.id === jid)
      expect(owner).toBeDefined()
      expect(connectionFor(owner!.text, '32')).not.toBeNull()
    }
  })
})
