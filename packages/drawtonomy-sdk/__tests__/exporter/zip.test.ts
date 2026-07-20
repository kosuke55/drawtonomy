// @ts-nocheck
// vitest runs on Node so fs / path / child_process are available, but this
// test file is type-checked alongside the SDK source. We use @ts-nocheck
// instead of pulling in @types/node.
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { buildZip, toDosDateTime, _crc32ForTest } from '../../src/exporter/zip'

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

  it('writes zero last-mod time/date when modifiedAt is omitted (legacy behavior)', async () => {
    const blob = buildZip([{ path: 'a.txt', data: 'hello' }])
    const ab = await blob.arrayBuffer()
    const u8 = new Uint8Array(ab)
    // Local File Header: time at offset 10-11, date at offset 12-13.
    expect(u8[10]).toBe(0)
    expect(u8[11]).toBe(0)
    expect(u8[12]).toBe(0)
    expect(u8[13]).toBe(0)
  })

  it('writes the given modifiedAt into local header and central directory as DOS date/time', async () => {
    // 2026-07-20 15:42:30 local time.
    const modifiedAt = new Date(2026, 6, 20, 15, 42, 30)
    const { time: expectedTime, date: expectedDate } = toDosDateTime(modifiedAt)

    const blob = buildZip([{ path: 'a.txt', data: 'hello' }], modifiedAt)
    const ab = await blob.arrayBuffer()
    const u8 = new Uint8Array(ab)

    // Local File Header: time at offset 10-11, date at offset 12-13 (LE).
    expect(u8[10] | (u8[11] << 8)).toBe(expectedTime)
    expect(u8[12] | (u8[13] << 8)).toBe(expectedDate)

    // Central Directory File Header signature 0x02014b50 follows local
    // header (30 + pathBytes.length) + data.length bytes for a single entry.
    const localHeaderSize = 30 + 'a.txt'.length
    const cdOffset = localHeaderSize + 'hello'.length
    expect(u8[cdOffset]).toBe(0x50)
    expect(u8[cdOffset + 1]).toBe(0x4b)
    expect(u8[cdOffset + 2]).toBe(0x01)
    expect(u8[cdOffset + 3]).toBe(0x02)
    // CD header: time at offset 12-13, date at offset 14-15 relative to cdOffset.
    expect(u8[cdOffset + 12] | (u8[cdOffset + 13] << 8)).toBe(expectedTime)
    expect(u8[cdOffset + 14] | (u8[cdOffset + 15] << 8)).toBe(expectedDate)
  })

  it('produces an archive whose extracted mtime year matches modifiedAt (not 1979/1980)', async () => {
    const modifiedAt = new Date(2026, 6, 20, 15, 42, 30)
    const blob = buildZip([{ path: 'a.txt', data: 'hello' }], modifiedAt)
    const ab = await blob.arrayBuffer()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drawtonomy-zip-mtime-'))
    const zipPath = path.join(tmp, 'out.zip')
    fs.writeFileSync(zipPath, Buffer.from(ab))

    const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf-8' })
    // `unzip -l` renders MM-DD-YYYY.
    expect(listing).toContain('07-20-2026')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('toDosDateTime', () => {
  it('converts a known Date to the expected DOS date/time bit-packed values', () => {
    // 2026-07-20 15:42:30.
    // date: ((2026-1980) << 9) | (7 << 5) | 20 = (46 << 9) | 224 | 20 = 23552 + 244 = 23796
    // time: (15 << 11) | (42 << 5) | (30 >>> 1) = 30720 + 1344 + 15 = 32079
    const { time, date } = toDosDateTime(new Date(2026, 6, 20, 15, 42, 30))
    expect(date).toBe(23796)
    expect(time).toBe(32079)
  })

  it('clamps dates before 1980 to 1980-01-01 00:00:00', () => {
    const { time, date } = toDosDateTime(new Date(1979, 10, 30, 12, 0, 0))
    // date: ((1980-1980) << 9) | (1 << 5) | 1 = 33
    expect(date).toBe(33)
    expect(time).toBe(0)
  })

  it('round-trips a mid-range date through bit-packing without overflow', () => {
    const { time, date } = toDosDateTime(new Date(2000, 0, 1, 0, 0, 0))
    expect(date).toBe(((2000 - 1980) << 9) | (1 << 5) | 1)
    expect(time).toBe(0)
  })
})
