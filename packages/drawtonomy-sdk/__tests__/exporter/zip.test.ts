// @ts-nocheck
// vitest runs on Node so fs / path / child_process are available, but this
// test file is type-checked alongside the SDK source. We use @ts-nocheck
// instead of pulling in @types/node.
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { buildZip, _crc32ForTest } from '../../src/exporter/zip'

describe('crc32', () => {
  it('matches standard CRC-32 value for "123456789"', () => {
    const data = new TextEncoder().encode('123456789')
    expect(_crc32ForTest(data) >>> 0).toBe(0xcbf43926)
  })

  it('returns 0 for empty input', () => {
    expect(_crc32ForTest(new Uint8Array())).toBe(0)
  })
})

describe('buildZip', () => {
  it('produces a Blob with application/zip mime type', async () => {
    const blob = buildZip([{ path: 'a.txt', data: 'hello' }])
    expect(blob.type).toBe('application/zip')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('writes Local File Header signature and EOCD signature', async () => {
    const blob = buildZip([{ path: 'a.txt', data: 'hello' }])
    const ab = await blob.arrayBuffer()
    const u8 = new Uint8Array(ab)
    // Local File Header at offset 0: 0x04034b50 (little-endian).
    expect(u8[0]).toBe(0x50)
    expect(u8[1]).toBe(0x4b)
    expect(u8[2]).toBe(0x03)
    expect(u8[3]).toBe(0x04)
    // EOCD signature 0x06054b50 must appear near the end.
    let foundEocd = false
    for (let i = u8.length - 22; i >= 0; i--) {
      if (
        u8[i] === 0x50 && u8[i + 1] === 0x4b &&
        u8[i + 2] === 0x05 && u8[i + 3] === 0x06
      ) {
        foundEocd = true
        break
      }
    }
    expect(foundEocd).toBe(true)
  })

  it('produces an archive that the system unzip can list and extract', async () => {
    const blob = buildZip([
      { path: 'pkg/scene.xodr', data: '<OpenDRIVE>x</OpenDRIVE>' },
      { path: 'pkg/scene.xosc', data: '<OpenSCENARIO>y</OpenSCENARIO>' },
    ])
    const ab = await blob.arrayBuffer()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drawtonomy-zip-'))
    const zipPath = path.join(tmp, 'out.zip')
    fs.writeFileSync(zipPath, Buffer.from(ab))

    const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf-8' })
    expect(listing).toContain('pkg/scene.xodr')
    expect(listing).toContain('pkg/scene.xosc')

    execFileSync('unzip', ['-q', zipPath, '-d', tmp])
    expect(fs.readFileSync(path.join(tmp, 'pkg/scene.xodr'), 'utf-8')).toBe('<OpenDRIVE>x</OpenDRIVE>')
    expect(fs.readFileSync(path.join(tmp, 'pkg/scene.xosc'), 'utf-8')).toBe('<OpenSCENARIO>y</OpenSCENARIO>')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('preserves multi-byte UTF-8 content', async () => {
    const blob = buildZip([{ path: 'note.txt', data: 'こんにちは' }])
    const ab = await blob.arrayBuffer()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drawtonomy-zip-utf-'))
    const zipPath = path.join(tmp, 'utf.zip')
    fs.writeFileSync(zipPath, Buffer.from(ab))

    execFileSync('unzip', ['-q', zipPath, '-d', tmp])
    expect(fs.readFileSync(path.join(tmp, 'note.txt'), 'utf-8')).toBe('こんにちは')
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
