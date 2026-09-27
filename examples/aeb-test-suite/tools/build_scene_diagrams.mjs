#!/usr/bin/env node
// Build each test case diagram: an abstract scene (road, vehicles, motion arrows, parameter
// dimensions), like a Euro NCAP protocol figure, drawn with drawtonomy scene shapes.
// Output: the testcase.yaml `diagram` file (e.g. testcases/cut-in/car/aeb-cut-in-brake.drawtonomy.svg).
// The file embeds the editable snapshot, so it opens for editing in drawtonomy.
//
// Usage (from the repository root):
//   node tools/build_scene_diagrams.mjs [--app https://www.drawtonomy.com] [--only TC-ID,...] [--png-dir <dir>] [--dry-run]
//
// Steps:
//   1. Build a snapshot JSON per test case from DEFS (motion kind, target type, title).
//      Coordinates are in meters, converted at 16.67 px/m (matches the vehicle templates).
//   2. Serve a minimal SVG with the snapshot on loopback and open it with `<app>/?open=<url>`.
//   3. Export via menu -> Export -> Editable SVG (rendered by the app itself).
//   4. Re-open the exported SVG and check the shape count is unchanged.
//   5. With --png-dir, also save a 2x PNG for review.
//
// Requires Playwright. --app is the drawtonomy to render with (default https://www.drawtonomy.com).
// Optional: the committed diagrams are already generated; run this only to regenerate them.

import { createServer } from 'node:http'
import { readFile, readdir, writeFile, stat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PX = 16.67 // px / m (same scale as the OpenDRIVE import)
const LANE_W = 3.5 // m
const ROAD_LEN = 60 // m

const RED = '#AA0508'
const EGO_COLOR = '#FFFFFF'
const INK = '#1F2937'
const MUTED = '#6B7280'

// Target type -> template (sizes as in the testcase descriptions).
const VEHICLES = {
  car: { templateId: 'sedan', subtype: 'sedan', widthM: 2.0, lengthM: 5.04 },
  motorcycle: { templateId: 'motorcycle', subtype: 'motorcycle', widthM: 0.8, lengthM: 2.2 },
}

const NOUN = { car: 'car', motorcycle: 'motorcycle' }

// One entry per test case. kind = motion, actor = target type, title = heading above the figure.
const DEFS = {
  'TC-AEB-001': { kind: 'lead-brake', actor: 'car', title: 'Lead car brakes (CCRb)' },
  'TC-AEB-002': { kind: 'stationary', actor: 'car', title: 'Stopped car (CCRs)' },
  'TC-AEB-002-MC': { kind: 'stationary', actor: 'motorcycle', title: 'Stopped motorcycle (CCRs)' },
  'TC-AEB-003': { kind: 'cut-in', actor: 'car', title: 'Cut-in then brake' },
  'TC-AEB-003-MC': { kind: 'cut-in', actor: 'motorcycle', title: 'Cut-in then brake — motorcycle' },
}

// ---------------------------------------------------------------- scene

function sceneBuilder() {
  const shapes = []
  let n = 0
  const id = (p) => `shape:${p}_${++n}`
  const px = (m) => Math.round(m * PX * 100) / 100
  // lane center y [px] (top = left lane, travel = +x)
  const laneY = (i) => px(LANE_W * (i + 0.5))

  function point(xM, yPx) {
    const s = { id: id('pt'), type: 'point', x: px(xM), y: yPx, rotation: 0, zIndex: 1, props: { color: 'black', visible: false, osmId: '' } }
    shapes.push(s)
    return s.id
  }
  function boundary(yPx, subtype) {
    const a = point(0, yPx)
    const b = point(ROAD_LEN, yPx)
    const s = {
      id: id('ls'), type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 2,
      props: {
        pointIds: [a, b], color: '#FFFFFF', strokeWidth: 2, osmId: '',
        attributes: { type: 'line_thin', subtype },
        ...(subtype === 'dashed' ? { dashLength: 40, gapLength: 30 } : {}),
      },
    }
    shapes.push(s)
    return s.id
  }
  function road() {
    const b = [0, 1, 2, 3].map((i) => boundary(px(LANE_W * i), i === 0 || i === 3 ? 'solid' : 'dashed'))
    for (let i = 0; i < 3; i++) {
      shapes.push({
        id: id('lane'), type: 'lane', x: 0, y: 0, rotation: 0, zIndex: 0,
        props: {
          leftBoundaryId: b[i], rightBoundaryId: b[i + 1], invertLeft: false, invertRight: false,
          color: 'default', size: 'm', next: [], prev: [], osmId: '',
          attributes: { type: 'lanelet', subtype: 'road', one_way: 'yes' },
        },
      })
    }
  }
  /** Vehicle. rearM = rear position [m], lane = 0 left / 1 center / 2 right. Returns front [m]. */
  function vehicle(kind, rearM, lane, color, name, opacity) {
    const v = VEHICLES[kind]
    shapes.push({
      id: id('veh'), type: 'vehicle', x: px(rearM + v.lengthM / 2), y: laneY(lane), rotation: 90, zIndex: 10,
      props: {
        w: px(v.widthM), h: px(v.lengthM), color, size: 'm', osmId: '', templateId: v.templateId,
        attributes: { type: 'vehicle', subtype: v.subtype, name },
        ...(opacity != null ? { opacity } : {}),
      },
    })
    return rearM + v.lengthM
  }
  /** Straight arrow. heads = 'end' | 'both'. */
  function arrow(x1M, y1, x2M, y2, { color = INK, width = 3, head = 12, heads = 'end', style = 'solid' } = {}) {
    const a = point(x1M, y1)
    const b = point(x2M, y2)
    shapes.push({
      id: id('arrow'), type: 'line_arrow', x: 0, y: 0, rotation: 0, zIndex: 20,
      props: { pointIds: [a, b], color, strokeWidth: width, headSize: head, arrowheads: heads, lineStyle: style },
    })
  }
  /** Curved arrow (smoothed path with an end arrowhead). pts = [[xM, yPx], ...] */
  function curve(pts, { color = INK, width = 3, head = 14 } = {}) {
    const ids = pts.map(([x, y]) => point(x, y))
    shapes.push({
      id: id('path'), type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 20,
      props: {
        pointIds: ids, color, strokeWidth: width, osmId: '', isPath: true, smooth: true,
        arrowHead: true, arrowHeadSize: head, attributes: { type: 'path', subtype: 'solid' },
      },
    })
  }
  /** Helper line (dimension extension lines). */
  function line(x1M, y1, x2M, y2, { color = MUTED, width = 1.5, subtype = 'dashed' } = {}) {
    const a = point(x1M, y1)
    const b = point(x2M, y2)
    shapes.push({
      id: id('ls'), type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 15,
      props: {
        pointIds: [a, b], color, strokeWidth: width, osmId: '',
        attributes: { type: 'line_thin', subtype }, ...(subtype === 'dashed' ? { dashLength: 5, gapLength: 4 } : {}),
      },
    })
  }
  /** Text (centered). */
  function text(xM, yPx, str, { size = 13, color = INK, align = 'center' } = {}) {
    shapes.push({
      id: id('text'), type: 'text', x: px(xM), y: yPx, rotation: 0, zIndex: 30,
      props: { w: 200, h: 24, text: str, color, fontSize: size, font: 'sans', textAlign: align, autoSize: true },
    })
  }
  /** Dimension below the road: double arrow, extension lines, label. topA/topB = line start y [px]. */
  function dimension(aM, bM, label, topA, topB) {
    const y = px(LANE_W * 3) + 16
    line(aM, topA, aM, y + 7)
    line(bM, topB, bM, y + 7)
    arrow(aM, y, bM, y, { color: INK, width: 1.5, head: 9, heads: 'both' })
    text((aM + bM) / 2, y + 17, label, { size: 13 })
  }
  return { shapes, px, laneY, road, vehicle, arrow, curve, line, text, dimension }
}

/** Lane change curve (smoothstep). y0 -> y1 [px] over x0..x1 [m], plus `tail` m straight. */
function laneChangePts(x0, x1, y0, y1, tail = 0) {
  const pts = []
  const n = 8
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const k = t * t * (3 - 2 * t)
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * k])
  }
  if (tail > 0) pts.push([x1 + tail, y1])
  return pts
}

// x [m] of the name label under the target (right lane); short vehicles shift forward to clear the extension line
const underX = (rearM, kind) => rearM + Math.max(VEHICLES[kind].lengthM / 2, 4.5)

const vehicleBottom = (b, kind, lane) => b.laneY(lane) + b.px(VEHICLES[kind].widthM) / 2

function buildScene(def) {
  const b = sceneBuilder()
  const { laneY, px } = b
  const a = def.actor
  b.road()
  b.text(ROAD_LEN / 2, -20, def.title, { size: 18 })
  const labelY = laneY(2) // right lane holds the labels
  const egoRear = 3
  const egoFront = b.vehicle('car', egoRear, 1, EGO_COLOR, 'Ego')
  // ego name below (right lane), speed above its arrow
  b.text(egoRear + 2.5, labelY, 'Ego')
  const egoArrow = () => {
    b.arrow(egoFront + 1, laneY(1), egoFront + 8, laneY(1))
    b.text(egoFront + 4.5, laneY(1) - 16, 'EgoSpeed', { size: 12 })
  }

  if (def.kind === 'lead-brake') {
    const leadRear = egoFront + 22
    const leadFront = b.vehicle(a, leadRear, 1, RED, 'Lead')
    egoArrow()
    b.arrow(leadFront + 2, laneY(1), leadFront + 10, laneY(1), { color: RED })
    b.text(leadFront + 6, laneY(1) - 16, 'EgoSpeed', { size: 12, color: RED })
    b.text(underX(leadRear, a), labelY, 'Lead', { color: RED })
    b.text(leadFront + 6.5, laneY(1) + 16, 'brakes at LeadDecel (t=2 s)', { size: 12, color: RED })
    b.dimension(egoFront, leadRear, 'Gap', vehicleBottom(b, 'car', 1), vehicleBottom(b, a, 1))
  } else if (def.kind === 'stationary') {
    const tRear = egoFront + 26
    b.vehicle(a, tRear, 1, RED, 'Target')
    egoArrow()
    b.text(underX(tRear, a), labelY, `Stopped ${NOUN[a]}`, { color: RED })
    b.text(egoFront + 13, laneY(0), 'Road friction: Friction (μ)', { color: MUTED })
    b.dimension(egoFront, tRear, 'TargetDistance', vehicleBottom(b, 'car', 1), vehicleBottom(b, a, 1))
  } else if (def.kind === 'cut-in') {
    const gap = 13
    const cRear = egoFront + gap
    const len = VEHICLES[a].lengthM
    const cFront = b.vehicle(a, cRear, 0, RED, 'Cutter')
    egoArrow()
    b.text(egoRear + 5.5, laneY(0), 'EgoSpeed × CutInSpeedFactor', { color: RED })
    // cut-in: left lane -> ego lane (2 s); translucent vehicle at the end, then braking
    const s = cFront + 0.5
    const e = s + 14
    b.curve(laneChangePts(s, e, laneY(0), laneY(1)), { color: RED })
    b.text(s + 12.5, laneY(0), 'Lane change 2 s', { color: RED })
    const gRear = e + 0.8
    b.vehicle(a, gRear, 1, RED, 'Cutter (after)', 0.35)
    b.text(gRear + len / 2 + 1, labelY, 'brakes at LeadDecel', { color: RED })
    b.dimension(egoFront, cRear, 'CutInGap', vehicleBottom(b, 'car', 1), vehicleBottom(b, a, 0))
  } else {
    throw new Error(`unknown kind ${def.kind}`)
  }
  return { version: '1.3', timestamp: new Date().toISOString(), shapes: b.shapes }
}

// ---------------------------------------------------------------- test cases

async function listTestcases(only) {
  const out = []
  async function walk(dir) {
    const names = (await readdir(dir)).sort()
    if (names.includes('testcase.yaml')) {
      const yml = await readFile(path.join(dir, 'testcase.yaml'), 'utf-8')
      const pick = (k) => yml.match(new RegExp(`^${k}:\\s*(.+?)\\s*$`, 'm'))?.[1]
      const id = pick('id')
      const rel = path.relative(ROOT, dir).split(path.sep).join('/')
      if (only && !only.includes(id)) return
      out.push({ id, rel, diagram: pick('diagram') ?? `${path.basename(dir)}.drawtonomy.svg` })
      return
    }
    for (const nm of names) {
      const p = path.join(dir, nm)
      if ((await stat(p)).isDirectory()) await walk(p)
    }
  }
  await walk(path.join(ROOT, 'testcases'))
  return out
}

// ---------------------------------------------------------------- open in the app and export

function parseArgs(argv) {
  const out = { app: 'https://www.drawtonomy.com', only: null, pngDir: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--app') out.app = argv[++i].replace(/\/+$/, '')
    else if (a === '--only') out.only = argv[++i].split(',')
    else if (a === '--png-dir') out.pngDir = path.resolve(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
  }
  return out
}

async function loadChromium() {
  for (const mod of ['@playwright/test', 'playwright']) {
    try {
      const m = await import(mod)
      if (m.chromium) return m.chromium
    } catch {
      // try the next one
    }
  }
  throw new Error('Playwright not found')
}

function snapshotSvg(snapshot) {
  const b64 = Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" data-drawtonomy-snapshot="${b64}"></svg>`
}

function startServer(files) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    const body = files.get(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (body == null) {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.setHeader('Content-Type', 'image/svg+xml')
    res.end(body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })))
}

async function openInApp(page, app, url, expectShapes) {
  await page.goto(`${app}/?open=${encodeURIComponent(url)}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction((n) => {
    const ed = window.__editor || window.testEditor
    return ed && ed.getCurrentPageShapes().length === n
  }, expectShapes, { timeout: 60000 })
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window.__editor || window.testEditor).selectNone?.())
  await page.waitForTimeout(300)
}

async function exportDrawtonomySvg(page) {
  const btn = page.locator('[data-testid="export-drawtonomy-button"]')
  if (!(await btn.isVisible().catch(() => false))) {
    await page.click('[data-testid="main-menu-trigger"]')
    await page.click('[data-testid="export-menu-button"]')
  }
  const download = page.waitForEvent('download', { timeout: 60000 })
  await btn.click()
  const text = await readFile(await (await download).path(), 'utf-8')
  await page.keyboard.press('Escape')
  return text
}

async function countShapes(page) {
  return page.evaluate(() => {
    const out = {}
    for (const s of (window.__editor || window.testEditor).getCurrentPageShapes()) out[s.type] = (out[s.type] ?? 0) + 1
    return out
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const tcs = await listTestcases(args.only)
  const missing = tcs.filter((t) => !DEFS[t.id])
  if (missing.length) throw new Error(`no DEFS entry for: ${missing.map((t) => t.id).join(', ')}`)
  const files = new Map()
  const scenes = tcs.map((t) => {
    const snap = buildScene(DEFS[t.id])
    files.set(`/in/${t.id}.drawtonomy.SVG`, snapshotSvg(snap))
    return { ...t, snap }
  })
  if (args.dryRun) {
    for (const s of scenes) console.log(s.id, s.snap.shapes.length, 'shapes')
    return
  }
  const chromium = await loadChromium()
  const { server, origin } = await startServer(files)
  const browser = await chromium.launch()
  let failures = 0
  try {
    for (const s of scenes) {
      const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
      const page = await context.newPage()
      try {
        await openInApp(page, args.app, `${origin}/in/${s.id}.drawtonomy.SVG`, s.snap.shapes.length)
        const before = await countShapes(page)
        const svg = await exportDrawtonomySvg(page)
        if (!svg.includes('data-drawtonomy-snapshot=')) throw new Error('export has no editable snapshot')
        const out = path.join(ROOT, s.rel, s.diagram)
        await writeFile(out, svg)
        // re-open the exported SVG and compare shape counts
        files.set(`/out/${s.id}.drawtonomy.SVG`, svg)
        await openInApp(page, args.app, `${origin}/out/${s.id}.drawtonomy.SVG`, s.snap.shapes.length)
        const after = await countShapes(page)
        const same = JSON.stringify(before) === JSON.stringify(after)
        if (!same) throw new Error(`shape count changed on re-open: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
        if (args.pngDir) {
          await mkdir(args.pngDir, { recursive: true })
          const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
          await page.setViewportSize({ width: Math.ceil(vb[2]), height: Math.ceil(vb[3]) })
          const png = await browser.newContext({ viewport: { width: Math.ceil(vb[2]), height: Math.ceil(vb[3]) }, deviceScaleFactor: 2 })
          const p2 = await png.newPage()
          await p2.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`)
          await p2.waitForTimeout(300)
          await p2.locator('svg').first().screenshot({ path: path.join(args.pngDir, `diagram-${s.id}.png`) })
          await png.close()
        }
        console.log(`ok  ${s.id} -> ${path.relative(ROOT, out)} (${(svg.length / 1024).toFixed(0)} KiB, reopen ${JSON.stringify(after)})`)
      } catch (e) {
        failures++
        console.error(`NG  ${s.id}: ${e.message}`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
  process.exit(failures ? 1 : 0)
}

main()
