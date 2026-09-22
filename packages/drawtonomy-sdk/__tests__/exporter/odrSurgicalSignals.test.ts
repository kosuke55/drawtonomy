// Surgical <signal> rewriting on OpenDRIVE round trips.
//
// Moving, deleting or adding one signal used to regenerate the whole carrying
// road: the road's state hash covers the regulatory shapes' positions, so the
// road counted as edited and the surgical (width-only) path was never even
// entered. The regenerated road lost its verbatim plan view, its length gained
// fitting noise, and empty <elevationProfile> / <lateralProfile> elements plus
// a synthesized center lane appeared.
//
// A signal sits in <signals> as a direct child of <road>, positioned by (s, t)
// on the road's own reference line. Nothing else in the road depends on it, so
// a signal-only edit is expressible as a byte-local rewrite of the <signal>
// elements — exactly the treatment lane <width> records already get.
//
// These pin that contract: the emitted road differs from the source in the
// touched <signal> element and nowhere else, ids survive for <controller> and
// <signalReference> to keep pointing at, a signal pushed off the road falls
// back to full regeneration, and a signal edit does not drag the other roads
// the same signal touches into regeneration.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { extractOdrDocument } from '../../src/exporter/odrCarryThrough'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'

const FIXTURES = join(__dirname, '..', 'fixtures')
const SIGNALS_TWO_ROADS = join(FIXTURES, 'signals_two_roads.xodr')

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
  for (const ts of imported.trafficSigns ?? []) {
    shapes.push({
      id: ts.id, type: 'traffic_sign', x: ts.x, y: ts.y, rotation: 0, zIndex: 0,
      props: {
        w: ts.w, h: ts.h, color: 'default', attributes: ts.attributes,
        osmId: ts.osmId, affectedLaneIds: ts.affectedLaneIds, stopLineId: ts.stopLineId,
      },
    })
  }
  for (const cw of imported.crosswalks ?? []) {
    shapes.push({
      id: cw.id, type: 'crosswalk', x: cw.x, y: cw.y, rotation: 0, zIndex: 0,
      props: {
        startX: cw.startX, startY: cw.startY, endX: cw.endX, endY: cw.endY,
        crosswalkWidth: cw.crosswalkWidth, color: 'default', attributes: cw.attributes,
        osmId: cw.osmId, affectedLaneIds: cw.affectedLaneIds, stopLineId: cw.stopLineId,
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
  const xml = readFileSync(SIGNALS_TWO_ROADS, 'utf-8')
  return { xml, imported: odrToShapes(parseOpenDriveXml(xml)) }
}

const exportWith = (imported: ImportedShapes): string =>
  exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

const roadText = (xml: string, id: string): string =>
  extractOdrDocument(xml)!.roads.find(r => r.id === id)!.text

/** Every `<signal ...>` opening tag of a road, keyed by its id. */
const signalTags = (text: string): Map<string, string> => {
  const map = new Map<string, string>()
  for (const tag of text.match(/<signal\b[^>]*>/g) ?? []) {
    const id = tag.match(/\bid="([^"]*)"/)?.[1]
    if (id !== undefined) map.set(id, tag)
  }
  return map
}

const attr = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

/** Fail with the parser's own message when the emitted XML is not well-formed. */
const expectWellFormed = (xml: string): void => {
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  const err = doc.querySelector('parsererror')
  expect(err?.textContent ?? '').toBe('')
  expect(doc.documentElement.nodeName).toBe('OpenDRIVE')
}

/**
 * Byte diff of a road element against its source, with the `<signal>` elements
 * of the given ids masked out. An empty string means the road is verbatim
 * apart from those signals.
 */
const maskSignals = (text: string, ids: readonly string[]): string => {
  let out = text
  for (const id of ids) {
    out = out.replace(
      new RegExp(`[^\\S\\n]*<signal\\b[^>]*\\bid="${id}"[^>]*(?:/>|>[\\s\\S]*?</signal>)\\n?`),
      `<SIGNAL:${id}>`
    )
  }
  return out
}

describe('surgical <signal> rewriting', () => {
  it('re-emits the fixture verbatim without an edit (baseline)', () => {
    const { xml, imported } = importFixture()
    const out = exportWith(imported)
    const doc = extractOdrDocument(xml)!
    for (const road of doc.roads) expect(out).toContain(road.text)
    for (const c of doc.controllers) expect(out).toContain(c.text)
  })

  // (a) move: only the touched signal's s / t change.
  it('rewrites only s/t of the moved signal and keeps every other byte', () => {
    const { xml, imported } = importFixture()
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    // Road 1 runs along +x (hdg 0). Canvas y grows downward, so a canvas -y
    // move is +y in ENU: 2 m along the reference-line normal (+t) and 3 m
    // forward along the travel direction (+s).
    tl.x += 3 * PIXELS_PER_METER
    tl.y -= 2 * PIXELS_PER_METER

    const out = exportWith(imported)
    const before = roadText(xml, '1')
    const after = roadText(out, '1')

    // Only the moved signal's element differs; everything else is byte-equal.
    expect(maskSignals(after, ['100'])).toBe(maskSignals(before, ['100']))

    const tagBefore = signalTags(before).get('100')!
    const tagAfter = signalTags(after).get('100')!
    expect(parseFloat(attr(tagAfter, 's')!)).toBeCloseTo(93, 3)
    expect(parseFloat(attr(tagAfter, 't')!)).toBeCloseTo(-6.5, 3)
    // Every attribute other than s / t is carried through verbatim.
    const strip = (t: string): string => t.replace(/\bs="[^"]*"/, 's=""').replace(/\bt="[^"]*"/, 't=""')
    expect(strip(tagAfter)).toBe(strip(tagBefore))

    // The untouched signal 101 keeps its exact source bytes.
    expect(signalTags(after).get('101')).toBe(signalTags(before).get('101'))
  })

  // (b) delete: the element disappears, nothing else moves.
  it('removes only the deleted <signal> element', () => {
    const { xml, imported } = importFixture()
    imported.trafficSigns = (imported.trafficSigns ?? []).filter(
      s => s.attributes.odr_signal_id !== '101'
    )

    const out = exportWith(imported)
    const before = roadText(xml, '1')
    const after = roadText(out, '1')

    expect(signalTags(after).has('101')).toBe(false)
    expect(signalTags(after).get('100')).toBe(signalTags(before).get('100'))
    // Masking the deleted element out of the source makes the two identical
    // (the removal took its own line with it, nothing else shifted).
    expect(after).toBe(before.replace(
      /[^\S\n]*<signal\b[^>]*\bid="101"[^>]*(?:\/>|>[\s\S]*?<\/signal>)\n?/,
      ''
    ))
  })

  // (c) add: one element appears just before </signals>, source untouched.
  it('inserts an added signal before </signals> and keeps the existing ones', () => {
    const { xml, imported } = importFixture()
    const src = imported.trafficSigns![0]
    imported.trafficSigns!.push({
      ...src,
      id: 'ts_added',
      // 10 m further along road 1 (canvas +x is ENU +x on this road).
      x: src.x + 10 * PIXELS_PER_METER,
      attributes: { ...src.attributes, odr_signal_id: '' },
    })

    const out = exportWith(imported)
    const before = roadText(xml, '1')
    const after = roadText(out, '1')

    // Both source signals survive byte-identically.
    expect(signalTags(after).get('100')).toBe(signalTags(before).get('100'))
    expect(signalTags(after).get('101')).toBe(signalTags(before).get('101'))
    // Exactly one signal was added.
    expect(signalTags(after).size).toBe(signalTags(before).size + 1)
    const addedId = [...signalTags(after).keys()].find(id => !signalTags(before).has(id))!
    // Fresh id, above the document's signal id space; placed at s = 50.
    expect(Number(addedId)).toBeGreaterThan(101)
    const addedTag = signalTags(after).get(addedId)!
    expect(parseFloat(attr(addedTag, 's')!)).toBeCloseTo(50, 3)
    // It went in as the last child of <signals> (right before the close).
    const signalsBlock = after.match(/<signals>[\s\S]*?<\/signals>/)![0]
    expect(signalsBlock.lastIndexOf(`id="${addedId}"`)).toBeGreaterThan(
      signalsBlock.lastIndexOf('id="100"')
    )
  })

  // (d) signal move + lane width edit in one export.
  it('combines a signal move with the existing lane-width surgical rewrite', () => {
    const { xml, imported } = importFixture()
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    tl.x += 3 * PIXELS_PER_METER

    // Widen lane -2 of road 1 by moving its outer boundary laterally.
    const record = imported.sidecar.roadRecords!['1']
    const lane = record.laneShapeIds
      .map(id => imported.lanes.find(l => l.id === id)!)
      .find(l => l.attributes.odr_lane_id === '-2')!
    const ls = imported.linestrings.find(l => l.id === lane.rightBoundaryId)!
    for (const pid of ls.pointIds) {
      imported.points.find(p => p.id === pid)!.y += 1 * PIXELS_PER_METER
    }

    const out = exportWith(imported)
    const before = parseOpenDriveXml(xml).roads.find(r => r.id === '1')!
    const after = parseOpenDriveXml(out).roads.find(r => r.id === '1')!

    // The reference frame survived (surgical, not full regeneration).
    expect(after.length).toBeCloseTo(before.length, 6)
    expect(after.planView.length).toBe(before.planView.length)
    expect(after.elevations.length).toBe(before.elevations.length)
    // The width change landed.
    const widthOf = (r: typeof before, id: number): number =>
      r.laneSections[0].right.find(l => l.id === id)!.widths[0].a
    expect(widthOf(after, -2)).toBeCloseTo(4.5, 2)
    expect(widthOf(after, -1)).toBeCloseTo(3.5, 2)
    // The signal move landed too.
    const tag = signalTags(roadText(out, '1')).get('100')!
    expect(parseFloat(attr(tag, 's')!)).toBeCloseTo(93, 3)
  })

  // (e) the atomic regulatory rule must not drag the other touched road along.
  it('keeps the other roads a moved signal touches verbatim', () => {
    const { xml, imported } = importFixture()
    // Signal 100 also applies to road 2 through <signalReference>, so both
    // roads are in its "touching" set.
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    expect(tl.affectedLaneIds.length).toBeGreaterThan(2)
    tl.x += 3 * PIXELS_PER_METER

    const out = exportWith(imported)
    // Road 2 has no reason to change: it only references the signal by id.
    expect(out).toContain(roadText(xml, '2'))
    expect(extractOdrDocument(out)!.roads.length).toBe(2)
  })

  // (f) ids survive so <controller> / <signalReference> keep resolving.
  it('keeps signal ids stable for <controller> and <signalReference>', () => {
    const { xml, imported } = importFixture()
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    tl.x += 3 * PIXELS_PER_METER

    const out = exportWith(imported)
    const doc = extractOdrDocument(out)!
    // Controller 900 survives byte-identically, still naming signal 100.
    expect(doc.controllers.length).toBe(1)
    expect(doc.controllers[0].text).toBe(extractOdrDocument(xml)!.controllers[0].text)
    // The <signalReference id="100"> of road 2 still resolves to a definition.
    const definedIds = new Set(doc.roads.flatMap(r => r.signalIds))
    for (const ref of out.match(/<signalReference\b[^>]*/g) ?? []) {
      expect(definedIds).toContain(ref.match(/\bid="([^"]*)"/)![1])
    }
  })

  // (g) off-road signals fall back: s must stay inside [0, length].
  it('falls back to full regeneration when a signal is pushed off the road', () => {
    const { xml, imported } = importFixture()
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    // Road 1 ends at s = 100 (x = 100 m); push the signal 40 m past the end.
    tl.x += 40 * PIXELS_PER_METER

    const out = exportWith(imported)
    // Road 1 is no longer verbatim (full regeneration is the safe answer).
    expect(out).not.toContain(roadText(xml, '1'))
    // And nothing emitted a signal outside its road's [0, length].
    for (const road of parseOpenDriveXml(out).roads) {
      for (const sig of road.signals) {
        expect(sig.s).toBeGreaterThanOrEqual(0)
        expect(sig.s).toBeLessThanOrEqual(road.length + 1e-6)
      }
    }
  })

  it('keeps a signal edit out of the OTHER road entirely (dirty road count)', () => {
    const { xml, imported } = importFixture()
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    tl.x += 3 * PIXELS_PER_METER
    const out = exportWith(imported)

    const src = extractOdrDocument(xml)!
    const dst = extractOdrDocument(out)!
    const dstById = new Map(dst.roads.map(r => [r.id, r.text]))
    const changed = src.roads.filter(r => dstById.get(r.id) !== r.text).map(r => r.id)
    expect(changed).toEqual(['1'])
  })

  // (h) the source's whitespace is not part of the contract: a document with
  // no line breaks between tags must still come out well-formed. The indent
  // taken for an appended <signal> has to be whitespace, not whatever text
  // happens to precede </signals> on the same line.
  it('stays well-formed when the source XML has no line breaks', () => {
    const minified = readFileSync(SIGNALS_TWO_ROADS, 'utf-8')
      .replace(/>\s+</g, '><')
      .trim()
    const imported = odrToShapes(parseOpenDriveXml(minified))
    const src = imported.trafficSigns![0]
    imported.trafficSigns!.push({
      ...src,
      id: 'ts_added',
      x: src.x + 10 * PIXELS_PER_METER,
      attributes: { ...src.attributes, odr_signal_id: '' },
    })

    const out = exportWith(imported)
    expectWellFormed(out)
    // The added signal really is in the output (the road did not silently
    // fall back to something that drops it).
    const defined = new Set(extractOdrDocument(out)!.roads.flatMap(r => r.signalIds))
    expect(defined.size).toBe(3)
    // And the road element was not duplicated by a runaway indent.
    expect((out.match(/<road\b/g) ?? []).length).toBe(2)
  })

  it('stays well-formed when the source XML is pretty-printed', () => {
    const { imported } = importFixture()
    const src = imported.trafficSigns![0]
    imported.trafficSigns!.push({
      ...src,
      id: 'ts_added',
      x: src.x + 10 * PIXELS_PER_METER,
      attributes: { ...src.attributes, odr_signal_id: '' },
    })
    expectWellFormed(exportWith(imported))
  })

  // (i) deleting a signal must not leave <control> / <signalReference> naming
  // an id that no road defines any more.
  it('drops <control> and <signalReference> records for a deleted signal', () => {
    const { imported } = importFixture()
    // Traffic light 100 is named by controller 900 AND referenced from road 2.
    imported.trafficLights = imported.trafficLights.filter(
      t => t.attributes.odr_signal_id !== '100'
    )

    const out = exportWith(imported)
    const doc = extractOdrDocument(out)!
    const defined = new Set(doc.roads.flatMap(r => r.signalIds))
    expect(defined.has('100')).toBe(false)

    // No <control> names a signal nothing defines.
    for (const c of doc.controllers) {
      for (const sid of c.signalIds) expect(defined).toContain(sid)
    }
    // No <signalReference> points at a signal nothing defines.
    for (const ref of out.match(/<signalReference\b[^>]*/g) ?? []) {
      expect(defined).toContain(ref.match(/\bid="([^"]*)"/)![1])
    }
  })

  // (j) a road promoted to dirty AFTER the surgical plan ran must not leave
  // its provisional signal ids behind in a <controller>.
  it('does not name provisionally allocated ids of a road that went dirty', () => {
    const { imported } = importFixture()
    // Duplicate light 100 onto road 1 as a brand new signal in the same
    // controller group, so the surgical pass allocates it a fresh id...
    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    imported.trafficLights.push({
      ...tl,
      id: 'tl_added',
      x: tl.x - 10 * PIXELS_PER_METER,
      attributes: { ...tl.attributes, odr_signal_id: '' },
    })
    // ...and then edit road 2's lanes, which drags road 1 back into
    // regeneration through the atomic regulatory rule (signal 100 touches
    // both roads).
    const rec2 = imported.sidecar.roadRecords!['2']
    const lane2 = imported.lanes.find(l => l.id === rec2.laneShapeIds[0])!
    lane2.attributes = { ...lane2.attributes, speed_limit: '37' }

    const out = exportWith(imported)
    const doc = extractOdrDocument(out)!
    const defined = new Set(doc.roads.flatMap(r => r.signalIds))
    for (const c of doc.controllers) {
      for (const sid of c.signalIds) expect(defined).toContain(sid)
    }
  })

  // (k) an ordinary new signal (no odr_road_id, only affected lanes) must be
  // emitted, not silently swallowed by the consumed-shape bookkeeping.
  it('emits a newly created signal that carries no source road id', () => {
    const { xml, imported } = importFixture()
    const src = imported.trafficSigns![0]
    const before = imported.trafficSigns!.length + imported.trafficLights.length
    imported.trafficSigns!.push({
      ...src,
      id: 'ts_new',
      x: src.x + 10 * PIXELS_PER_METER,
      // A shape the user drew: it knows the lanes it applies to and nothing
      // about the source document.
      attributes: {},
    })

    const out = exportWith(imported)
    const defined = extractOdrDocument(out)!.roads.flatMap(r => r.signalIds)
    expect(defined.length).toBe(before + 1)
    expectWellFormed(out)

    // It went in surgically: road 1 keeps its source plan view and the two
    // source signals byte-identically, and road 2 is untouched.
    const beforeRoad = roadText(xml, '1')
    const afterRoad = roadText(out, '1')
    expect(signalTags(afterRoad).get('100')).toBe(signalTags(beforeRoad).get('100'))
    expect(signalTags(afterRoad).get('101')).toBe(signalTags(beforeRoad).get('101'))
    expect(afterRoad).toContain('<geometry s="0" x="0" y="0" hdg="0" length="100">')
    expect(out).toContain(roadText(xml, '2'))
  })

  // (l) a <signal> the importer does not turn into a shape (unknown dynamic
  // type) lives only in the source text. Moving a DIFFERENT signal must not
  // delete it: "no shape claims it" is not the same as "the user removed it".
  it('keeps a sidecar-only <signal> the importer never shaped', () => {
    const xml = readFileSync(SIGNALS_TWO_ROADS, 'utf-8').replace(
      '    </signals>\n  </road>\n  <road name="curve"',
      '      <signal s="20" t="1" id="102" type="999999" dynamic="yes" orientation="+"/>\n' +
        '    </signals>\n  </road>\n  <road name="curve"'
    )
    expect(xml).toContain('id="102"')
    const imported = odrToShapes(parseOpenDriveXml(xml))
    // The importer really does not shape it (otherwise this test proves nothing).
    const shaped = [...imported.trafficLights, ...(imported.trafficSigns ?? [])].map(
      s => s.attributes.odr_signal_id
    )
    expect(shaped).not.toContain('102')

    const tl = imported.trafficLights.find(t => t.attributes.odr_signal_id === '100')!
    tl.x += 3 * PIXELS_PER_METER
    const out = exportWith(imported)

    const defined = new Set(extractOdrDocument(out)!.roads.flatMap(r => r.signalIds))
    expect(defined.has('102')).toBe(true)
  })
})
