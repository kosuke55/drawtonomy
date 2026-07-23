// Minimal ZIP builder (store mode, no compression) with no external deps.
//
// PKZIP APPNOTE.TXT 6.3.10 compatible. Bundles multiple files into a single
// zip. Compression method = 0 (store), which is fine for small XML payloads.
// Directories are implicit via slashes in entry paths.

export interface ZipEntry {
  /** Path inside the zip, e.g. "scene/scene.xodr" */
  path: string
  /** Entry content; strings are UTF-8 encoded internally */
  data: string | Uint8Array
}

const TEXT_ENCODER = new TextEncoder()

/**
 * Standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320), table-driven.
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Little-endian writer helpers. */
function writeU16(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
}
function writeU32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

export interface DosDateTime {
  time: number
  date: number
}

/**
 * Convert a JS Date into the DOS date/time pair used by ZIP local file
 * headers and central directory records.
 *
 * DOS date: bits 15-9 = year-1980, bits 8-5 = month (1-12), bits 4-0 = day (1-31).
 * DOS time: bits 15-11 = hour (0-23), bits 10-5 = minute (0-59), bits 4-0 = second/2.
 *
 * The DOS format cannot represent years before 1980; such dates are
 * clamped to 1980-01-01 00:00:00.
 */
export function toDosDateTime(d: Date): DosDateTime {
  let year = d.getFullYear()
  let month = d.getMonth() + 1
  let day = d.getDate()
  let hour = d.getHours()
  let minute = d.getMinutes()
  let second = d.getSeconds()

  if (year < 1980) {
    year = 1980
    month = 1
    day = 1
    hour = 0
    minute = 0
    second = 0
  }

  const date = ((year - 1980) << 9) | (month << 5) | day
  const time = (hour << 11) | (minute << 5) | (second >>> 1)
  return { time, date }
}

interface PreparedEntry {
  path: string
  pathBytes: Uint8Array
  data: Uint8Array
  crc: number
  /** Offset of the Local File Header within the zip. */
  localHeaderOffset: number
}

function toBytes(d: string | Uint8Array): Uint8Array {
  return typeof d === 'string' ? TEXT_ENCODER.encode(d) : d
}

/**
 * Bundle ZipEntry[] into a single application/zip Blob.
 *
 * @param modifiedAt - Timestamp written into each entry's local header and
 *   central directory record (DOS date/time format). When omitted, entries
 *   are written with a zero timestamp (DOS epoch, 1980-01-01).
 */
export function buildZip(entries: ZipEntry[], modifiedAt?: Date): Blob {
  const { time: dosTime, date: dosDate } = modifiedAt
    ? toDosDateTime(modifiedAt)
    : { time: 0, date: 0 }

  // 1. Emit Local File Header + data for each entry, tracking offsets.
  const prepared: PreparedEntry[] = []
  let cursor = 0
  const localChunks: Uint8Array[] = []

  for (const entry of entries) {
    const pathBytes = TEXT_ENCODER.encode(entry.path)
    const data = toBytes(entry.data)
    const crc = crc32(data)
    const localHeader = new Uint8Array(30 + pathBytes.length)
    // Local File Header signature 0x04034b50.
    writeU32(localHeader, 0, 0x04034b50)
    writeU16(localHeader, 4, 20)        // version needed to extract (2.0)
    writeU16(localHeader, 6, 0x0800)     // general purpose bit flag (UTF-8 filename)
    writeU16(localHeader, 8, 0)          // compression = store
    writeU16(localHeader, 10, dosTime)   // last mod time
    writeU16(localHeader, 12, dosDate)   // last mod date
    writeU32(localHeader, 14, crc)       // CRC-32
    writeU32(localHeader, 18, data.length) // compressed size
    writeU32(localHeader, 22, data.length) // uncompressed size
    writeU16(localHeader, 26, pathBytes.length) // file name length
    writeU16(localHeader, 28, 0)         // extra field length
    localHeader.set(pathBytes, 30)

    const localHeaderOffset = cursor
    localChunks.push(localHeader)
    localChunks.push(data)
    cursor += localHeader.length + data.length

    prepared.push({
      path: entry.path,
      pathBytes,
      data,
      crc,
      localHeaderOffset,
    })
  }

  const localBytes = concatBytes(localChunks)

  // 2. Central Directory.
  const cdChunks: Uint8Array[] = []
  let cdSize = 0
  for (const e of prepared) {
    const cdHeader = new Uint8Array(46 + e.pathBytes.length)
    // Central Directory File Header signature 0x02014b50.
    writeU32(cdHeader, 0, 0x02014b50)
    writeU16(cdHeader, 4, 20)         // version made by
    writeU16(cdHeader, 6, 20)         // version needed to extract
    writeU16(cdHeader, 8, 0x0800)      // general purpose bit flag
    writeU16(cdHeader, 10, 0)          // compression = store
    writeU16(cdHeader, 12, dosTime)    // last mod time
    writeU16(cdHeader, 14, dosDate)    // last mod date
    writeU32(cdHeader, 16, e.crc)
    writeU32(cdHeader, 20, e.data.length) // compressed size
    writeU32(cdHeader, 24, e.data.length) // uncompressed size
    writeU16(cdHeader, 28, e.pathBytes.length)
    writeU16(cdHeader, 30, 0)          // extra field length
    writeU16(cdHeader, 32, 0)          // file comment length
    writeU16(cdHeader, 34, 0)          // disk number start
    writeU16(cdHeader, 36, 0)          // internal file attributes
    writeU32(cdHeader, 38, 0)          // external file attributes
    writeU32(cdHeader, 42, e.localHeaderOffset)
    cdHeader.set(e.pathBytes, 46)
    cdChunks.push(cdHeader)
    cdSize += cdHeader.length
  }
  const cdBytes = concatBytes(cdChunks)

  // 3. End Of Central Directory record (22 bytes).
  const eocd = new Uint8Array(22)
  writeU32(eocd, 0, 0x06054b50)        // EOCD signature
  writeU16(eocd, 4, 0)                  // disk number
  writeU16(eocd, 6, 0)                  // disk where CD starts
  writeU16(eocd, 8, prepared.length)    // number of CD records on this disk
  writeU16(eocd, 10, prepared.length)   // total number of CD records
  writeU32(eocd, 12, cdSize)            // size of CD
  writeU32(eocd, 16, localBytes.length) // offset of CD start
  writeU16(eocd, 20, 0)                 // .ZIP file comment length

  // Slice() exposes plain ArrayBuffer; the DOM Blob constructor type does
  // not accept ArrayBufferLike views directly under strict TS settings.
  return new Blob(
    [localBytes.slice().buffer, cdBytes.slice().buffer, eocd.slice().buffer],
    { type: 'application/zip' }
  )
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// Exported for test use only.
export { crc32 as _crc32ForTest }
