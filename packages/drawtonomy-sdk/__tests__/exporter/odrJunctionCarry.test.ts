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

    // (a) of the source's roads, exactly the edited one changed.
    const changed = [...source].filter(([id, r]) => emitted.get(id)?.text !== r.text).map(([id]) => id)
    expect(changed).toEqual(['0'])

    // The twelve connecting roads are byte-verbatim and keep their junction.
    for (const id of ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16']) {
      expect(emitted.get(id)!.junction).toBe('4')
      expect(emitted.get(id)!.text).toBe(source.get(id)!.text)
    }

    // The three other mainlines are byte-verbatim too.
    for (const id of ['1', '2', '3']) {
      expect(emitted.get(id)!.text).toBe(source.get(id)!.text)
    }

    // The <junction> element itself is verbatim, and it is the only one.
    expect(junctionsById(out).get('4')).toBe(junctionsById(xml).get('4'))
    expect(junctionsById(out).size).toBe(1)

    // (b) no intersection is emitted twice. The edited road has lanes on both
    // sides, so it regenerates as two bundles and only one of them can keep
    // its id — that one extra road is the whole growth. What used to happen
    // instead was twelve demoted roads and forty-one synthesized ones.
    for (const id of source.keys()) expect(emitted.has(id)).toBe(true)
    expect(emitted.size).toBe(source.size + 1)
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
})

describe('junction invariants', () => {
  const invariants = (xml: string): void => {
    const doc = extractOdrDocument(xml)!
    const roadIds = new Set(doc.roads.map(r => r.id))
    const named = new Set<string>()
    for (const j of doc.junctions) {
      for (const m of j.text.matchAll(/connectingRoad="([^"]*)"/g)) {
        // Every <connection connectingRoad> resolves to a real road.
        expect(roadIds.has(m[1])).toBe(true)
        named.add(m[1])
      }
      for (const m of j.text.matchAll(/incomingRoad="([^"]*)"/g)) {
        expect(roadIds.has(m[1])).toBe(true)
      }
    }
    // Every junction-stamped road is named by some <connection>.
    for (const r of doc.roads) {
      if (r.junction === '-1') continue
      expect(named.has(r.id)).toBe(true)
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
})
