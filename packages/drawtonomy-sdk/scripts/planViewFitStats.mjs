// Reports plan-view fit statistics for the bundled OpenDRIVE fixtures:
// primitive counts by kind, total fitted length, and the worst deviation of
// the fit from the sampled reference line. Used to compare fitter changes
// against a known baseline.
//
// Usage: node scripts/planViewFitStats.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOpenDriveXml } from '../src/exporter/opendriveParser.ts'
import { sampleReferenceLine, evalGeometry } from '../src/exporter/odrGeometry.ts'
import { fitPlanView } from '../src/exporter/odrGeometryFit.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '__tests__', 'fixtures')

function distToPolyline(p, poly) {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

let grand = { line: 0, arc: 0, paramPoly3: 0, spiral: 0, poly3: 0 }
let grandLen = 0
for (const file of readdirSync(FIXTURES).filter(f => f.endsWith('.xodr')).sort()) {
  const map = parseOpenDriveXml(readFileSync(join(FIXTURES, file), 'utf8'))
  const kinds = { line: 0, arc: 0, paramPoly3: 0, spiral: 0, poly3: 0 }
  let total = 0
  let worst = 0
  for (const road of map.roads) {
    const samples = sampleReferenceLine(road)
    if (samples.length < 2) continue
    const fit = fitPlanView(samples.map(s => ({ x: s.x, y: s.y })))
    for (const g of fit.geometries) kinds[g.kind] = (kinds[g.kind] ?? 0) + 1
    total += fit.length
    const dense = []
    for (const g of fit.geometries) {
      const n = Math.max(2, Math.ceil(g.length / 0.25))
      for (let k = 0; k <= n; k++) {
        const p = evalGeometry(g, (g.length * k) / n)
        dense.push({ x: p.x, y: p.y })
      }
    }
    for (const p of dense) worst = Math.max(worst, distToPolyline(p, samples))
  }
  const n = Object.values(kinds).reduce((a, b) => a + b, 0)
  for (const k of Object.keys(kinds)) grand[k] += kinds[k]
  grandLen += total
  console.log(
    `${file.padEnd(28)} geoms=${String(n).padStart(4)} ` +
      `line=${kinds.line} arc=${kinds.arc} pp3=${kinds.paramPoly3} ` +
      `len=${total.toFixed(3)} worstDev=${worst.toFixed(4)}`
  )
}
const gn = Object.values(grand).reduce((a, b) => a + b, 0)
console.log(`${'TOTAL'.padEnd(28)} geoms=${String(gn).padStart(4)} line=${grand.line} arc=${grand.arc} pp3=${grand.paramPoly3} len=${grandLen.toFixed(3)}`)
