// Generational OpenDRIVE round-trip metrics.
//
// An unedited import -> export cycle should be lossless: every original
// <road> / <junction> / <controller> re-emitted verbatim, every road id kept.
// Repeating the cycle (gen1 -> gen2 -> gen3) exposes slow decay that a single
// round trip hides — elements that survive one pass but drop out on the next.
//
// For each generation this reports:
//   roads       roads in the emitted document
//   verbatim    roads whose element text is byte-identical to generation 0
//   junctions   <junction> elements emitted
//   controllers <controller> elements emitted
//   idKept      share of generation-0 road ids still present
//   signals     <signal> definitions emitted
//
// Pass --edit to nudge one boundary point in generation 1 before exporting.
// That is the interesting case: an unedited document carries through whole,
// while a single edit is what used to bleed elements out on every later cycle.
//
// Usage: npx tsx scripts/odr-generation-metrics.mts [--edit] <file.xodr> ...
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseOpenDriveXml } from '../src/exporter/opendriveParser'
import { odrToShapes, type OdrImportResult } from '../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../src/exporter/opendrive'
import { extractOdrDocument } from '../src/exporter/odrCarryThrough'
import type { DrawtonomySnapshot } from '../src/types'

const GENERATIONS = 3

/** Snapshot built from an import result, mirroring the editor's shape model. */
function snapshotFrom(im: OdrImportResult): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of im.points) {
    shapes.push({
      id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0,
      props: { color: 'black', visible: true, osmId: p.osmId },
    })
  }
  for (const ls of im.linestrings) {
    shapes.push({
      id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0,
      props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId },
    })
  }
  for (const l of im.lanes) {
    shapes.push({
      id: l.id, type: 'lane', x: l.x, y: l.y, rotation: 0, zIndex: 0,
      props: {
        leftBoundaryId: l.leftBoundaryId, rightBoundaryId: l.rightBoundaryId,
        invertLeft: l.invertLeft, invertRight: l.invertRight,
        color: 'default', size: 'm', attributes: l.attributes,
        next: l.next, prev: l.prev, osmId: l.osmId,
        ...(l.yieldLaneIds ? { yieldLaneIds: l.yieldLaneIds } : {}),
      },
    })
  }
  for (const tl of im.trafficLights) {
    shapes.push({
      id: tl.id, type: 'traffic_light', x: tl.x, y: tl.y, rotation: 0, zIndex: 0,
      props: {
        w: tl.w, h: tl.h, color: 'default', style: '', attributes: tl.attributes,
        osmId: tl.osmId, affectedLaneIds: tl.affectedLaneIds, stopLineId: tl.stopLineId,
        controllerId: tl.controllerId ?? '',
      },
    })
  }
  for (const ts of im.trafficSigns ?? []) {
    shapes.push({
      id: ts.id, type: 'traffic_sign', x: ts.x, y: ts.y, rotation: 0, zIndex: 0,
      props: {
        w: ts.w, h: ts.h, color: 'default', attributes: ts.attributes,
        osmId: ts.osmId, affectedLaneIds: ts.affectedLaneIds, stopLineId: ts.stopLineId,
      },
    })
  }
  for (const cw of im.crosswalks ?? []) {
    shapes.push({
      id: cw.id, type: 'crosswalk', x: cw.x, y: cw.y, rotation: 0, zIndex: 0,
      props: {
        startX: cw.startX, startY: cw.startY, endX: cw.endX, endY: cw.endY,
        crosswalkWidth: cw.crosswalkWidth, color: 'default', attributes: cw.attributes,
        osmId: cw.osmId, affectedLaneIds: cw.affectedLaneIds, stopLineId: cw.stopLineId,
      },
    })
  }
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
    origin: im.originLatLon ?? { lat: 35, lon: 139 },
  }
}

interface GenStats {
  roads: number
  verbatimRoads: number
  junctions: number
  controllers: number
  idKept: number
  signals: number
}

function measure(xml: string, baseRoadTexts: Map<string, string>): GenStats {
  const doc = extractOdrDocument(xml)
  if (!doc) return { roads: 0, verbatimRoads: 0, junctions: 0, controllers: 0, idKept: 0, signals: 0 }
  let verbatim = 0
  let idKept = 0
  const byId = new Map(doc.roads.map(r => [r.id, r]))
  for (const [id, text] of baseRoadTexts) {
    const r = byId.get(id)
    if (!r) continue
    idKept++
    if (r.text === text) verbatim++
  }
  return {
    roads: doc.roads.length,
    verbatimRoads: verbatim,
    junctions: doc.junctions.length,
    controllers: doc.controllers.length,
    idKept,
    signals: doc.roads.reduce((n, r) => n + r.signalIds.length, 0),
  }
}

const args = process.argv.slice(2)
const editFirstGeneration = args.includes('--edit')
const files = args.filter(a => a !== '--edit')
if (files.length === 0) {
  console.error('usage: odr-generation-metrics.mts [--edit] <file.xodr> [more.xodr ...]')
  process.exit(2)
}

for (const file of files) {
  const name = basename(file, '.xodr')
  const originalXml = readFileSync(file, 'utf-8')
  const baseDoc = extractOdrDocument(originalXml)
  if (!baseDoc) {
    console.log(`${name}: not an OpenDRIVE document; skipped`)
    continue
  }
  const baseRoadTexts = new Map(baseDoc.roads.map(r => [r.id, r.text]))
  const base: GenStats = {
    roads: baseDoc.roads.length,
    verbatimRoads: baseDoc.roads.length,
    junctions: baseDoc.junctions.length,
    controllers: baseDoc.controllers.length,
    idKept: baseDoc.roads.length,
    signals: baseDoc.roads.reduce((n, r) => n + r.signalIds.length, 0),
  }

  const rows: { gen: string; s: GenStats }[] = [{ gen: 'source', s: base }]
  let xml = originalXml
  for (let gen = 1; gen <= GENERATIONS; gen++) {
    const imported = odrToShapes(parseOpenDriveXml(xml))
    if (gen === 1 && editFirstGeneration && imported.lanes.length > 0) {
      // Nudge one interior boundary point (~1.8 m) so exactly one road goes
      // dirty and has to regenerate.
      const lane = imported.lanes[0]
      const ls = imported.linestrings.find(l => l.id === lane.leftBoundaryId)
      const pid = ls?.pointIds[Math.floor(ls.pointIds.length / 2)]
      const pt = pid ? imported.points.find(p => p.id === pid) : undefined
      if (pt) pt.y += 30
    }
    xml = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    rows.push({ gen: `gen${gen}`, s: measure(xml, baseRoadTexts) })
  }

  console.log(`\n=== ${name}${editFirstGeneration ? ' (edited in gen1)' : ''} ===`)
  console.log('gen     roads  verbatim  junctions  controllers  idKept  signals')
  for (const { gen, s } of rows) {
    const pct = base.roads > 0 ? ((s.idKept / base.roads) * 100).toFixed(0) : '0'
    console.log(
      `${gen.padEnd(7)} ${String(s.roads).padStart(5)}  ${String(s.verbatimRoads).padStart(8)}` +
        `  ${String(s.junctions).padStart(9)}  ${String(s.controllers).padStart(11)}` +
        `  ${(pct + '%').padStart(6)}  ${String(s.signals).padStart(7)}`
    )
  }
}
