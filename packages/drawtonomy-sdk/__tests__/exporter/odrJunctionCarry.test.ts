// Junction carry-through on OpenDRIVE round trips.
//
// Editing one mainline road used to regenerate its whole intersection. The
// junction rule says "a junction with a dirty member is dirty, and a dirty
// junction drags every connecting road with it", and since a junction's
// members include the incoming / outgoing mainlines, one edited road took its
// twelve connecting roads down with it.
//
// Worse, the regenerated roads were emitted with junction="-1", so they could
// not go back into the original <junction>. The exporter answered by
// synthesizing a second intersection out of the lane edges it saw: the twelve
// original connecting roads came out demoted to mainlines, and forty new
// connecting roads appeared beside them. One dragged boundary point turned a
// 16-road map into 57 roads.
//
// The rule is only needed when the <connection> table itself has to be
// rebuilt. When the regenerated roads keep their ids, keep their junction
// attribute, and still carry the lanes the table names, the original
// <junction> element is still correct and can be re-emitted verbatim.
//
// These pin that contract on esmini's fabriksgatan (4 mainlines, 12 connecting
// roads, 1 junction): an edit that cannot be absorbed laterally regenerates
// only the road it touched, the junction and its connecting roads stay
// verbatim, no road is invented, and an edit that does change the lane set
// still falls back to rebuilding the junction.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { extractOdrDocument } from '../../src/exporter/odrCarryThrough'
import type { DrawtonomySnapshot } from '../../src/types'

const FIXTURES = join(__dirname, '..', 'fixtures')
const FABRIKSGATAN = join(FIXTURES, 'fabriksgatan.xodr')

/** Wrap ImportedShapes into a DrawtonomySnapshot (mirrors the editor import). */
function snapshotFrom(imported: ImportedShapes): DrawtonomySnapshot {
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
      props: {
        pointIds: ls.pointIds, color: 'black', strokeWidth: 2,
        attributes: ls.attributes, osmId: ls.osmId,
      },
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
        ...(lane.yieldLaneIds ? { yieldLaneIds: lane.yieldLaneIds } : {}),
      },
    })
  }
  for (const tl of imported.trafficLights) {
    shapes.push({
      id: tl.id, type: 'traffic_light', x: tl.x, y: tl.y, rotation: 0, zIndex: 0,
      props: {
        w: tl.w, h: tl.h, color: 'default', style: '', attributes: tl.attributes,
        osmId: tl.osmId, affectedLaneIds: tl.affectedLaneIds,
        stopLineId: tl.stopLineId, controllerId: tl.controllerId ?? '',
      },
    })
  }
  const snapshot: DrawtonomySnapshot = {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
  }
  if (imported.originLatLon) snapshot.origin = imported.originLatLon
  return snapshot
}

const importFixture = (): { xml: string; imported: ImportedShapes } => {
  const xml = readFileSync(FABRIKSGATAN, 'utf-8')
  return { xml, imported: odrToShapes(parseOpenDriveXml(xml)) }
}

const exportWith = (imported: ImportedShapes): string =>
  exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

/** The recorded road a lane shape came from. */
const roadOfLane = (imported: ImportedShapes, laneId: string): string =>
  Object.entries(imported.sidecar.roadRecords!).find(([, r]) =>
    r.laneShapeIds.includes(laneId)
  )![0]

/**
 * Slide one interior boundary point of `laneId` along its own tangent. A
 * longitudinal drag cannot be expressed as a lane <width> rewrite, so the road
 * leaves the surgical path and genuinely regenerates — which is the case the
 * junction rule used to amplify.
 */
function nudgeAlongTangent(imported: ImportedShapes, laneId: string, metres: number): void {
  const lane = imported.lanes.find(l => l.id === laneId)!
  const ls = imported.linestrings.find(l => l.id === lane.leftBoundaryId)!
  const i = Math.floor(ls.pointIds.length / 2)
  const pt = imported.points.find(p => p.id === ls.pointIds[i])!
  const a = imported.points.find(p => p.id === ls.pointIds[i - 1])!
  const b = imported.points.find(p => p.id === ls.pointIds[i + 1])!
  const dx = b.x - a.x
  const dy = b.y - a.y
  const n = Math.hypot(dx, dy) || 1
  pt.x += (dx / n) * metres
  pt.y += (dy / n) * metres
}

/** Roads keyed by id, with their element text. */
const roadsById = (xml: string): Map<string, { text: string; junction: string }> =>
  new Map(extractOdrDocument(xml)!.roads.map(r => [r.id, { text: r.text, junction: r.junction }]))

/** <junction> elements keyed by id. */
const junctionsById = (xml: string): Map<string, string> =>
  new Map(extractOdrDocument(xml)!.junctions.map(j => [j.id, j.text]))

/** The first lane shape of the given recorded road. */
const firstLaneOf = (imported: ImportedShapes, roadId: string): string =>
  imported.sidecar.roadRecords![roadId].laneShapeIds[0]

/**
 * Slide one interior point of `laneId`'s given boundary sideways. A lateral
 * drag of the inner boundary changes the lane's width profile, which is the
 * edit that re-bundles a two-sided road.
 */
function nudgeSideways(
  imported: ImportedShapes,
  laneId: string,
  side: 'left' | 'right',
  px: number
): void {
  const lane = imported.lanes.find(l => l.id === laneId)!
  const bid = side === 'left' ? lane.leftBoundaryId : lane.rightBoundaryId
  const ls = imported.linestrings.find(l => l.id === bid)!
  const pt = imported.points.find(p => p.id === ls.pointIds[Math.floor(ls.pointIds.length / 2)])!
  pt.x += px
}

/**
 * Replace one of `laneId`'s boundaries with a private copy holding the same
 * points. Nothing moves, but the lane no longer SHARES a linestring with its
 * neighbour, so bundling puts it in a road of its own — the edit that hands a
 * road's lanes to more ids than the carried tables expect.
 */
function detachBoundary(
  imported: ImportedShapes,
  laneId: string,
  side: 'left' | 'right'
): void {
  const lane = imported.lanes.find(l => l.id === laneId)!
  const bid = side === 'left' ? lane.leftBoundaryId : lane.rightBoundaryId
  const ls = imported.linestrings.find(l => l.id === bid)!
  const copy = { ...ls, id: `${ls.id}__detached`, pointIds: [...ls.pointIds] }
  imported.linestrings.push(copy)
  if (side === 'left') lane.leftBoundaryId = copy.id
  else lane.rightBoundaryId = copy.id
}

/** Give a lane an attribute edit, so its road cannot stay verbatim. */
function setSpeedLimit(imported: ImportedShapes, laneId: string, value: string): void {
  const lane = imported.lanes.find(l => l.id === laneId)!
  lane.attributes = { ...(lane.attributes ?? {}), speed_limit: value }
}

/** ODR lane ids declared by a <road> element, centre lane excluded. */
const laneIdsOf = (roadText: string): string[] =>
  [...roadText.matchAll(/<lane\b[^>]*\bid="(-?\d+)"/g)].map(m => m[1]).filter(v => v !== '0')

describe('junction carry-through', () => {
  it('regenerates only the edited mainline, leaving the junction untouched', () => {
    const { xml, imported } = importFixture()
    const source = roadsById(xml)
    // Road 0 is a mainline that the junction names as an incoming road.
    const laneId = firstLaneOf(imported, '0')
    expect(roadOfLane(imported, laneId)).toBe('0')
    nudgeAlongTangent(imported, laneId, 30)

    const out = exportWith(imported)
    const emitted = roadsById(out)

    // (a) of the source's roads, only the edited one is regenerated. Road 0
    // has lanes on both sides, so it comes back as two roads and the three
    // connecting roads reaching the half that lost the id have that one
    // reference re-pointed — see 're-points the neighbours' below for the
    // byte-level pin. Nothing else is touched.
    const changed = [...source].filter(([id, r]) => emitted.get(id)?.text !== r.text).map(([id]) => id)
    expect(changed).toEqual(['0', '5', '11', '14'])

    // Every connecting road keeps its junction, and the nine that do not run
    // into road 0's other half are byte-verbatim.
    for (const id of ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']) {
      expect(emitted.get(id)!.junction).toBe('4')
    }
    for (const id of ['6', '7', '8', '9', '10', '12', '13', '15', '16']) {
      expect(emitted.get(id)!.text).toBe(source.get(id)!.text)
    }

    // The three other mainlines are byte-verbatim too.
    for (const id of ['1', '2', '3']) {
      expect(emitted.get(id)!.text).toBe(source.get(id)!.text)
    }

    // The <junction> element itself is verbatim, and it is the only one.
    expect(junctionsById(out).get('4')).toBe(junctionsById(xml).get('4'))
    expect(junctionsById(out).size).toBe(1)

    // (b) no intersection is emitted twice. Every source road is still
    // there, and the single extra road is road 0's other side. What used to
    // happen instead was twelve demoted roads and forty-one synthesized
    // ones.
    for (const id of source.keys()) expect(emitted.has(id)).toBe(true)
    expect(emitted.size).toBe(source.size + 1)
  })

  it('re-points the neighbours of a road that split in two', () => {
    // Road 0 has lanes on both sides, so regeneration emits it as two roads
    // and only one can keep id 0. The exporter gives the id to the side the
    // <connection> table names (the positive lanes) — which leaves the three
    // connecting roads that run into road 0's NEGATIVE lanes pointing at a
    // road that no longer has them. Those references have to follow the
    // lanes, or the export links into nothing.
    const { xml, imported } = importFixture()
    nudgeAlongTangent(imported, firstLaneOf(imported, '0'), 30)
    const emitted = roadsById(exportWith(imported))
    const source = roadsById(xml)

    // Road 0 kept the side the junction uses; the other side went to one
    // new road holding exactly the lanes road 0 gave up.
    expect(laneIdsOf(emitted.get('0')!.text).sort()).toEqual(['1', '2', '3'])
    const fresh = [...emitted.keys()].filter(id => !source.has(id))
    expect(fresh).toHaveLength(1)
    expect(laneIdsOf(emitted.get(fresh[0])!.text).sort()).toEqual(['-1', '-2', '-3'])

    // The connecting roads that used road 0's negative lanes now name the
    // road those lanes went to, with their lane links unchanged.
    for (const id of ['5', '11', '14']) {
      expect([id, emitted.get(id)!.text]).toEqual([
        id,
        source.get(id)!.text.replace(
          /(<successor elementType="road" elementId=")0(")/,
          `$1${fresh[0]}$2`
        ),
      ])
    }
  })

  it('keeps an edited connecting road inside its own junction', () => {
    const { xml, imported } = importFixture()
    const source = roadsById(xml)
    // Road 8 is a connecting road of junction 4 with three lanes.
    const laneId = firstLaneOf(imported, '8')
    nudgeAlongTangent(imported, laneId, 3)

    const out = exportWith(imported)
    const emitted = roadsById(out)

    // (c) the regenerated road still names its junction, and the original
    // <connection> still points at it with the same laneLinks.
    expect(emitted.get('8')).toBeDefined()
    expect(emitted.get('8')!.junction).toBe('4')
    expect(emitted.get('8')!.text).not.toBe(source.get('8')!.text)
    expect(junctionsById(out).get('4')).toBe(junctionsById(xml).get('4'))
    expect([...emitted.keys()].sort()).toEqual([...source.keys()].sort())
  })

  it('rebuilds the junction when an edit changes the connecting road lane set', () => {
    const { xml, imported } = importFixture()
    // Delete one lane of connecting road 8, so the <connection>'s laneLink
    // "from=-3 to=-3" no longer resolves. The carried table would dangle, so
    // the exporter must fall back to rebuilding the intersection.
    const doomed = imported.sidecar.roadRecords!['8'].laneShapeIds[2]
    imported.lanes = imported.lanes.filter(l => l.id !== doomed)

    const out = exportWith(imported)
    const carried = junctionsById(out).get('4')
    // Either the junction is gone (rebuilt under a new id) or its table was
    // rewritten — what must not happen is carrying a table that names lanes
    // the emitted road no longer has.
    expect(carried).not.toBe(junctionsById(xml).get('4'))
  })

  it('carries the junction whichever side of a mainline it uses', () => {
    // Roads 0 and 1 hand the junction their positive lanes, roads 2 and 3
    // their negative ones. A mainline with lanes on both sides splits into
    // two bundles and only one can inherit the road id, so the id has to go
    // to the side the <connection> table names — majority voting alone picks
    // by bundle order and lost the table half the time.
    for (const mainline of ['0', '1', '2', '3']) {
      const { xml, imported } = importFixture()
      nudgeAlongTangent(imported, firstLaneOf(imported, mainline), 30)
      const out = exportWith(imported)
      expect(junctionsById(out).get('4')).toBe(junctionsById(xml).get('4'))
      expect(junctionsById(out).size).toBe(1)
      expect(roadsById(out).size).toBe(roadsById(xml).size + 1)
    }
  })

  it('keeps the edited road saying it runs into the carried junction', () => {
    // The lane edges into the junction are left to the carried XML, so
    // nothing in connectivity planning fills the road's own <link> slot. The
    // road still has to name the junction, exactly as the source did.
    const { xml, imported } = importFixture()
    const sourceLink = roadsById(xml)
      .get('0')!
      .text.match(/<(?:predecessor|successor)\s+elementType="junction"\s+elementId="(\d+)"/)
    expect(sourceLink?.[1]).toBe('4')

    nudgeAlongTangent(imported, firstLaneOf(imported, '0'), 30)
    const emitted = roadsById(exportWith(imported)).get('0')!.text
    expect(emitted).toMatch(/<\w+ elementType="junction" elementId="4"\/>/)
  })

  it('keeps an unedited round trip verbatim', () => {
    const { xml, imported } = importFixture()
    const out = exportWith(imported)
    const source = roadsById(xml)
    const emitted = roadsById(out)
    for (const [id, r] of source) expect(emitted.get(id)!.text).toBe(r.text)
    expect(junctionsById(out).get('4')).toBe(junctionsById(xml).get('4'))
  })

  it('gives a regenerated connecting road both of its links back', () => {
    // The lane edges into a carried junction are left to the carried XML, so
    // connectivity planning skips them — and used to skip the connecting
    // road's own <link> with them. The road came out inside junction 4 with
    // an empty <link>, losing predecessor road 0 and successor road 1.
    const { xml, imported } = importFixture()
    nudgeSideways(imported, firstLaneOf(imported, '8'), 'left', 30)
    const out = exportWith(imported)
    const emitted = roadsById(out)
    const road8 = emitted.get('8')!
    expect(road8.junction).toBe('4')
    expect(road8.text).not.toBe(roadsById(xml).get('8')!.text)

    // Both ends name the roads the source named, at the same contact points.
    const link = road8.text.match(/<link>[\s\S]*?<\/link>/)![0]
    expect(link).toMatch(/<predecessor elementType="road" elementId="0" contactPoint="start"\/>/)
    expect(link).toMatch(/<successor elementType="road" elementId="1" contactPoint="start"\/>/)

    // And every lane links to a lane the neighbour really has.
    const lanes = [...road8.text.matchAll(/<lane\b[^>]*\bid="(-?\d+)"[\s\S]*?<\/lane>/g)]
    const linked = lanes.filter(m => m[1] !== '0' && /<(?:predecessor|successor)\s+id=/.test(m[0]))
    expect(linked.length).toBeGreaterThan(0)
    for (const m of linked) {
      const pred = m[0].match(/<predecessor\s+id="(-?\d+)"/)?.[1]
      const succ = m[0].match(/<successor\s+id="(-?\d+)"/)?.[1]
      if (pred !== undefined) expect(laneIdsOf(emitted.get('0')!.text)).toContain(pred)
      if (succ !== undefined) expect(laneIdsOf(emitted.get('1')!.text)).toContain(succ)
    }
  })

  it('keeps a lateral split resolving too', () => {
    // A lateral drag of road 0's inner boundary re-bundles it the same way a
    // longitudinal one does, through a different code path (the edit is a
    // width change rather than a reference-line change). No verbatim
    // neighbour may keep a lane successor into a lane road 0 no longer has.
    const { imported } = importFixture()
    nudgeSideways(imported, firstLaneOf(imported, '0'), 'right', 30)
    const emitted = roadsById(exportWith(imported))
    for (const [id, r] of emitted) {
      const succRoad = r.text.match(/<successor\s+elementType="road"\s+elementId="(\d+)"/)?.[1]
      if (succRoad === undefined) continue
      const have = laneIdsOf(emitted.get(succRoad)?.text ?? '')
      for (const m of r.text.matchAll(/<lane\b[^>]*\bid="-?\d+"[\s\S]*?<\/lane>/g)) {
        const succ = m[0].match(/<successor\s+id="(-?\d+)"/)?.[1]
        if (succ !== undefined) expect([id, succRoad, succ, have.includes(succ)]).toEqual([id, succRoad, succ, true])
      }
    }
  })

  it('does not carry a laneLink the emitted road renumbered away', () => {
    // Road 8's lane -1 is type="none", so the importer never makes a shape
    // for it and the exporter renumbers the surviving two lanes to -1, -2.
    // The carried table still says to="-2" and to="-3": one now means a
    // different lane and the other means nothing at all.
    const raw = readFileSync(FABRIKSGATAN, 'utf-8')
    const road8 = raw.match(/<road\b[^>]*\bid="8"[\s\S]*?<\/road>/)![0]
    let xml = raw.replace(road8, road8.replace(/(<lane\s+id="-1"\s+type=")[^"]*(")/, '$1none$2'))
    xml = xml.replace(
      /(<connection\b[^>]*connectingRoad="8"[^>]*>)([\s\S]*?)(<\/connection>)/g,
      (_m, open: string, body: string, close: string) =>
        open + body.replace(/\s*<laneLink\b[^>]*\bto="-1"[^>]*\/>/g, '') + close
    )
    const imported = odrToShapes(parseOpenDriveXml(xml))
    expect(imported.sidecar.roadRecords!['8'].laneShapeIds).toHaveLength(2)
    // Edit road 8 so it regenerates.
    for (const lid of imported.sidecar.roadRecords!['8'].laneShapeIds) {
      const l = imported.lanes.find(x => x.id === lid)!
      l.attributes = { ...(l.attributes ?? {}), speed_limit: '33' }
    }
    const out = exportWith(imported)
    const have = new Set(laneIdsOf(roadsById(out).get('8')?.text ?? ''))
    const j4 = junctionsById(out).get('4') ?? ''
    const named = [...j4.matchAll(/<connection\b[^>]*connectingRoad="8"[^>]*>([\s\S]*?)<\/connection>/g)]
      .flatMap(m => [...m[1].matchAll(/\bto="(-?\d+)"/g)].map(x => x[1]))
    expect(named.filter(t => !have.has(t))).toEqual([])
  })

  it('drops a connection the user disconnected instead of restoring it', () => {
    // Cutting every next/prev of road 8's lanes leaves the lanes in place,
    // so a carry rule that only asks "does the lane still exist" re-emits
    // the original table — and re-importing hands the user back the
    // connections they deleted.
    const { imported } = importFixture()
    const members = new Set(imported.sidecar.roadRecords!['8'].laneShapeIds)
    for (const l of imported.lanes) {
      if (members.has(l.id)) {
        l.next = []
        l.prev = []
      } else {
        l.next = (l.next ?? []).filter(id => !members.has(id))
        l.prev = (l.prev ?? []).filter(id => !members.has(id))
      }
    }
    const out = exportWith(imported)
    for (const text of junctionsById(out).values()) {
      expect(text).not.toMatch(/connectingRoad="8"/)
    }
  })
})

describe('junction invariants', () => {
  /**
   * Structural checks every emitted document has to satisfy, whatever the
   * edit was. They are deliberately about resolution, not about which plan
   * the exporter chose: carrying a junction and rebuilding it are both fine,
   * emitting a reference that does not resolve is not.
   */
  const invariants = (xml: string): void => {
    const doc = extractOdrDocument(xml)!
    const roadById = new Map(doc.roads.map(r => [r.id, r]))
    const junctionById = new Map(doc.junctions.map(j => [j.id, j.text]))
    const lanesOf = (id: string): Set<string> =>
      new Set(laneIdsOf(roadById.get(id)?.text ?? ''))

    for (const j of doc.junctions) {
      for (const conn of j.text.match(/<connection\b[^>]*>[\s\S]*?<\/connection>/g) ??
        j.text.match(/<connection\b[^>]*\/>/g) ??
        []) {
        const incoming = conn.match(/\bincomingRoad="([^"]*)"/)?.[1]
        const connecting = conn.match(/\bconnectingRoad="([^"]*)"/)?.[1]
        // Every road a <connection> names resolves to a real road.
        if (incoming !== undefined) expect(roadById.has(incoming)).toBe(true)
        if (connecting !== undefined) expect(roadById.has(connecting)).toBe(true)
        // Every <laneLink> names lanes that the two roads really emit.
        if (incoming === undefined || connecting === undefined) continue
        const from = lanesOf(incoming)
        const to = lanesOf(connecting)
        for (const link of conn.match(/<laneLink\b[^>]*\/?>/g) ?? []) {
          const f = link.match(/\bfrom="(-?\d+)"/)?.[1]
          const t = link.match(/\bto="(-?\d+)"/)?.[1]
          if (f !== undefined) expect(from.has(f)).toBe(true)
          if (t !== undefined) expect(to.has(t)).toBe(true)
        }
      }
    }

    for (const r of doc.roads) {
      // A road's junction attribute resolves, and that junction's own
      // <connection> table names the road as a connecting road. Being listed
      // by some OTHER junction is not enough.
      if (r.junction !== '-1') {
        const own = junctionById.get(r.junction)
        expect(own).toBeDefined()
        expect(new RegExp(`connectingRoad="${r.id}"`).test(own!)).toBe(true)
      }
      // Both ends of a road's own <link> resolve: a junction reference to an
      // emitted <junction>, a road reference to an emitted <road> whose lane
      // set contains every lane the lane-level links name.
      const linkText = r.text.match(/<link>[\s\S]*?<\/link>/)?.[0] ?? ''
      for (const tag of linkText.match(/<(?:predecessor|successor)\b[^>]*\/?>/g) ?? []) {
        const kind = tag.match(/\belementType="([^"]*)"/)?.[1]
        const id = tag.match(/\belementId="([^"]*)"/)?.[1]
        if (id === undefined) continue
        if (kind === 'junction') expect(junctionById.has(id)).toBe(true)
        else if (kind === 'road') expect(roadById.has(id)).toBe(true)
      }
      const roadPred = linkText.match(
        /<predecessor\s+elementType="road"\s+elementId="(\d+)"/
      )?.[1]
      const roadSucc = linkText.match(/<successor\s+elementType="road"\s+elementId="(\d+)"/)?.[1]
      for (const laneM of r.text.matchAll(/<lane\b[^>]*\bid="(-?\d+)"[\s\S]*?<\/lane>/g)) {
        for (const l of laneM[0].matchAll(/<(predecessor|successor)\s+id="(-?\d+)"\s*\/>/g)) {
          const target = l[1] === 'predecessor' ? roadPred : roadSucc
          // A lane link across a junction reference is resolved by the
          // <junction> table, checked above; only road-to-road links name a
          // lane on a specific neighbour.
          if (target === undefined) continue
          expect(lanesOf(target).has(l[2])).toBe(true)
        }
      }
    }
  }

  it('holds for an unedited export', () => {
    const { imported } = importFixture()
    invariants(exportWith(imported))
  })

  it('holds after a mainline edit', () => {
    const { imported } = importFixture()
    nudgeAlongTangent(imported, firstLaneOf(imported, '0'), 30)
    invariants(exportWith(imported))
  })

  it('holds after a connecting-road edit', () => {
    const { imported } = importFixture()
    nudgeAlongTangent(imported, firstLaneOf(imported, '8'), 3)
    invariants(exportWith(imported))
  })

  it('holds after a lane is deleted from a connecting road', () => {
    const { imported } = importFixture()
    const doomed = imported.sidecar.roadRecords!['8'].laneShapeIds[2]
    imported.lanes = imported.lanes.filter(l => l.id !== doomed)
    invariants(exportWith(imported))
  })

  it('holds after a mainline is re-bundled sideways', () => {
    // Road 0 has lanes on both sides; a lateral drag of the inner boundary
    // re-bundles it, so the two sides compete for the one road id.
    const { imported } = importFixture()
    nudgeSideways(imported, firstLaneOf(imported, '0'), 'right', 30)
    invariants(exportWith(imported))
  })

  it('holds after a connecting road is re-bundled sideways', () => {
    const { imported } = importFixture()
    nudgeSideways(imported, firstLaneOf(imported, '8'), 'left', 30)
    invariants(exportWith(imported))
  })

  it('holds after every connection of a connecting road is cut', () => {
    const { imported } = importFixture()
    const members = new Set(imported.sidecar.roadRecords!['8'].laneShapeIds)
    for (const l of imported.lanes) {
      if (members.has(l.id)) {
        l.next = []
        l.prev = []
      } else {
        l.next = (l.next ?? []).filter(id => !members.has(id))
        l.prev = (l.prev ?? []).filter(id => !members.has(id))
      }
    }
    invariants(exportWith(imported))
  })

  it('holds when a connecting road stops sharing a boundary with its neighbour', () => {
    // Road 8 is a connecting road of junction 4. Giving its first lane a
    // private copy of its right boundary detaches that lane from the bundle,
    // so the emitted roads no longer match what the carried <connection>
    // table names. The plan only learns this once the bundles exist, and it
    // used to answer by withdrawing the junction from the maps it appeared in
    // while leaving the rest of the plan — road ids, which roads regenerate,
    // which lanes stay verbatim — decided on the assumption it was carried.
    // Eleven roads then came out stamped junction="4" with no junction 4 in
    // the document, and two more linked to it.
    const { imported } = importFixture()
    detachBoundary(imported, firstLaneOf(imported, '8'), 'right')
    setSpeedLimit(imported, firstLaneOf(imported, '8'), '37')
    invariants(exportWith(imported))
  })

})
