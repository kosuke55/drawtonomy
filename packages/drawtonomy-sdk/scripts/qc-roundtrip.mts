// Generates OpenDRIVE files for the ASAM quality-checker CI gate:
//   1. an import -> export round trip of every .xodr sample in <mapsDir>
//   2. a from-scratch drawn scene (curved two-lane road, kinked branch
//      junction, zero-width taper, traffic light with stop line)
// Usage: npx tsx scripts/qc-roundtrip.mts <mapsDir> <outDir>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parseOpenDriveXml } from '../src/exporter/opendriveParser'
import { odrToShapes, type ImportedShapes } from '../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../src/exporter/opendrive'
import type { DrawtonomySnapshot } from '../src/types'

const [mapsDir, outDir] = process.argv.slice(2)
if (!mapsDir || !outDir) {
  console.error('usage: qc-roundtrip.mts <mapsDir> <outDir>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

function snapshotFrom(im: ImportedShapes): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of im.points) {
    shapes.push({ id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: p.osmId } })
  }
  for (const ls of im.linestrings) {
    shapes.push({ id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0, props: { pointIds: ls.pointIds, color: 'black', strokeWidth: 2, attributes: ls.attributes, osmId: ls.osmId } })
  }
  for (const l of im.lanes) {
    shapes.push({ id: l.id, type: 'lane', x: l.x, y: l.y, rotation: 0, zIndex: 0, props: { leftBoundaryId: l.leftBoundaryId, rightBoundaryId: l.rightBoundaryId, invertLeft: l.invertLeft, invertRight: l.invertRight, color: 'default', size: 'm', attributes: l.attributes, next: l.next, prev: l.prev, osmId: l.osmId, ...(l.yieldLaneIds ? { yieldLaneIds: l.yieldLaneIds } : {}) } })
  }
  for (const tl of im.trafficLights) {
    shapes.push({ id: tl.id, type: 'traffic_light', x: tl.x, y: tl.y, rotation: 0, zIndex: 0, props: { w: tl.w, h: tl.h, color: 'default', style: '', attributes: tl.attributes, osmId: tl.osmId, affectedLaneIds: tl.affectedLaneIds, stopLineId: tl.stopLineId } })
  }
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
    origin: im.originLatLon ?? { lat: 35, lon: 139 },
  }
}

for (const file of readdirSync(mapsDir).filter(f => f.endsWith('.xodr')).sort()) {
  const name = basename(file, '.xodr')
  const t0 = Date.now()
  const before = odrToShapes(parseOpenDriveXml(readFileSync(join(mapsDir, file), 'utf-8')))
  const xml = exportToOpenDrive(snapshotFrom(before))
  writeFileSync(join(outDir, `${name}_roundtrip.xodr`), xml)
  console.log(`${name}: lanes=${before.lanes.length} -> ${join(outDir, `${name}_roundtrip.xodr`)} (${Date.now() - t0}ms)`)
}

// ---- from-scratch drawn scene -------------------------------------------
const shapes: unknown[] = []
const point = (id: string, x: number, y: number) => shapes.push({ id, type: 'point', x, y, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } })
const linestring = (id: string, pointIds: string[]) => shapes.push({ id, type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0, props: { pointIds, color: 'black', strokeWidth: 2, attributes: {}, osmId: '' } })
const lane = (id: string, left: string, right: string, opts: { next?: string[]; prev?: string[]; attrs?: Record<string, string> } = {}) =>
  shapes.push({
    id, type: 'lane', x: 0, y: 0, rotation: 0, zIndex: 0,
    props: {
      leftBoundaryId: left, rightBoundaryId: right, invertLeft: false, invertRight: false,
      color: 'default', size: 'm',
      attributes: { type: 'lanelet', subtype: 'road', speed_limit: '40', ...(opts.attrs ?? {}) },
      next: opts.next ?? [], prev: opts.prev ?? [], osmId: '',
    },
  })

// Curved two-lane main road (shared middle boundary).
const R = 600
const a0 = -Math.PI / 2
const a1 = a0 + Math.PI / 3
const arc = (prefix: string, radius: number, n: number): string[] => {
  const ids: string[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    point(`${prefix}${i}`, radius * Math.cos(a), R + radius * Math.sin(a))
    ids.push(`${prefix}${i}`)
  }
  return ids
}
linestring('mL', arc('l', R + 120, 24))
linestring('mM', arc('m', R + 60, 24))
linestring('mR', arc('r', R, 24))
lane('main_outer', 'mL', 'mM', { next: ['exit_a'] })
lane('main_inner', 'mM', 'mR', { next: ['exit_b'] })

// Two diverging exits (exit_b kinks at the weld).
const dir: [number, number] = [-Math.sin(a1), Math.cos(a1)]
const at = (radius: number): [number, number] => [radius * Math.cos(a1), R + radius * Math.sin(a1)]
const straight = (prefix: string, [sx, sy]: [number, number], [dx, dy]: [number, number], n: number): string[] => {
  const ids: string[] = []
  for (let i = 0; i <= n; i++) {
    point(`${prefix}${i}`, sx + (dx * 300 * i) / n, sy + (dy * 300 * i) / n)
    ids.push(`${prefix}${i}`)
  }
  return ids
}
linestring('eaL', straight('ea', at(R + 120), dir, 6))
linestring('eaM', straight('eb', at(R + 60), dir, 6))
lane('exit_a', 'eaL', 'eaM', { prev: ['main_outer'] })
const kink: [number, number] = [
  dir[0] * Math.cos(0.34) - dir[1] * Math.sin(0.34),
  dir[0] * Math.sin(0.34) + dir[1] * Math.cos(0.34),
]
linestring('ebL', straight('ec', at(R + 60), kink, 6))
linestring('ebR', straight('ed', at(R), kink, 6))
lane('exit_b', 'ebL', 'ebR', { prev: ['main_inner'], attrs: { turn_direction: 'right' } })

// Zero-width taper chain off exit_a's far end: continues straight along the
// travel direction and narrows to a point (border-lane pattern).
const [tx, ty] = at(R + 120)
point('tp', tx + dir[0] * 450, ty + dir[1] * 450)
linestring('tL', ['ea6', 'tp'])
linestring('tR', ['eb6', 'tp'])
lane('taper', 'tL', 'tR', { prev: ['exit_a'] })
;(shapes.find(s => (s as { id: string }).id === 'exit_a') as { props: { next: string[] } }).props.next.push('taper')

// Traffic light over both main lanes with a stop line.
point('s1', at(R + 120)[0], at(R + 120)[1])
point('s2', at(R)[0], at(R)[1])
linestring('stop', ['s1', 's2'])
shapes.push({
  id: 'tl1', type: 'traffic_light', x: at(R + 120)[0] - 20, y: at(R + 120)[1] - 40, rotation: 0, zIndex: 0,
  props: { w: 30, h: 12, color: 'default', style: '', attributes: {}, osmId: '', affectedLaneIds: ['main_outer', 'main_inner'], stopLineId: 'stop' },
})

const sceneXml = exportToOpenDrive({
  version: '1.1',
  timestamp: new Date().toISOString(),
  shapes: shapes as DrawtonomySnapshot['shapes'],
  origin: { lat: 35, lon: 139 },
})
writeFileSync(join(outDir, 'drawn_scene.xodr'), sceneXml)
const back = odrToShapes(parseOpenDriveXml(sceneXml))
console.log(`drawn_scene: lanes=${back.lanes.length} trafficLights=${back.trafficLights.length}`)
