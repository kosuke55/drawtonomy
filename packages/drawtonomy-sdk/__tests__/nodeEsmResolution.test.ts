import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Guards that the published build is importable by plain Node.js, not only by bundlers.
 *
 * The build previously emitted extensionless relative imports (`from './types'`), which
 * bundlers resolve but Node's ESM loader rejects with ERR_MODULE_NOT_FOUND. Since the
 * package ships `"type": "module"` and is documented for headless tooling, that made
 * every `node script.mjs` usage fail while the bundled test suite stayed green.
 *
 * This test spawns a real Node process against `dist/`, so it fails if the emitted
 * specifiers regress — something an in-process (Vite-transformed) test cannot catch.
 */
describe('published build resolves under plain Node ESM', () => {
  const distEntry = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.js')

  it.skipIf(!existsSync(distEntry))('imports and runs a full generate + export cycle', () => {
    const script = `
      import * as sdk from ${JSON.stringify(distEntry)}
      const lane = sdk.createLaneWithBoundaries(
        [{ x: 0, y: 0 }, { x: 500, y: 0 }],
        [{ x: 0, y: 50 }, { x: 500, y: 50 }],
      )
      const snapshot = sdk.createSnapshot([...lane, sdk.createVehicle({ x: 100, y: 25 })])
      const xodr = sdk.exporter.exportToOpenDrive(snapshot, {})
      const reparsed = sdk.exporter.odrToShapes(sdk.exporter.parseOpenDriveXml(xodr))
      console.log(JSON.stringify({
        exports: Object.keys(sdk).length,
        roads: (xodr.match(/<road /g) || []).length,
        lanesAfterRoundTrip: reparsed.lanes.length,
      }))
    `
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    })
    const result = JSON.parse(stdout.trim().split('\n').pop() as string)

    expect(result.exports).toBeGreaterThan(0)
    expect(result.roads).toBe(1)
    expect(result.lanesAfterRoundTrip).toBe(1)
  })
})
