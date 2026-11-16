import { inflateSync } from 'node:zlib'

/** A deliberately narrow v1 intake policy: 8-bit RGB/RGBA, noninterlaced
 * PNG only. Validate complete chunks/CRC and decompressed scanlines, then
 * remove ALL ancillary chunks (EXIF/comments/ICC/text) before private storage.
 *
 * These are technical limits, NOT the final product's portfolio policy.
 */
export const PRIVATE_PORTFOLIO_MAX_BYTES = 5 * 1024 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
let crcTable: Uint32Array | undefined
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
      let c = index
      for (let i = 0; i < 8; i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      return c >>> 0
    })
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(type, 4, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4, 8), data])), 0)
  return Buffer.concat([header, data, crc])
}

/** Returns a fresh metadata-free PNG with the same raster pixels. */
export function sanitizePrivatePortfolioPng(input: Uint8Array): Buffer {
  if (input.byteLength < 60 || input.byteLength > PRIVATE_PORTFOLIO_MAX_BYTES) {
    throw new RangeError('Private portfolio PNG exceeds technical byte limit')
  }
  const raw = Buffer.from(input)
  if (!raw.subarray(0, 8).equals(pngSignature)) {
    throw new RangeError('Only PNG is supported for private portfolio intake')
  }
  let offset = 8
  let header: Buffer | null = null
  let width = 0, height = 0, pixelBytes = 0
  let seenIDAT = false, endedIDAT = false, seenIEND = false
  let compressedSize = 0
  const idat: Buffer[] = []
  while (offset < raw.length) {
    if (offset + 12 > raw.length) throw new RangeError('Truncated PNG chunk')
    const len = raw.readUInt32BE(offset)
    if (len > PRIVATE_PORTFOLIO_MAX_BYTES || offset + 12 + len > raw.length) {
      throw new RangeError('Invalid PNG chunk size')
    }
    const type = raw.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) throw new RangeError('Invalid PNG chunk tag')
    const payload = raw.subarray(offset + 8, offset + 8 + len)
    const expectedCRC = raw.readUInt32BE(offset + 8 + len)
    if (crc32(raw.subarray(offset + 4, offset + 8 + len)) !== expectedCRC) {
      throw new RangeError('PNG chunk checksum failed')
    }
    offset += 12 + len
    if (type === 'IHDR') {
      if (header || seenIDAT || len !== 13 || offset !== 33) {
        throw new RangeError('Invalid PNG header')
      }
      header = Buffer.from(payload)
      width = header.readUInt32BE(0)
      height = header.readUInt32BE(4)
      const depth = header[8], color = header[9]
      if (width < 1 || width > 2048 || height < 1 || height > 2048 ||
          depth !== 8 || (color !== 2 && color !== 6) ||
          header[10] !== 0 || header[11] !== 0 || header[12] !== 0) {
        throw new RangeError('Unsupported PNG dimensions or pixel format')
      }
      pixelBytes = color === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      if (!header || endedIDAT || seenIEND || len === 0) {
        throw new RangeError('Invalid PNG image data')
      }
      seenIDAT = true
      compressedSize += len
      if (compressedSize > PRIVATE_PORTFOLIO_MAX_BYTES) {
        throw new RangeError('PNG compressed pixels exceed limit')
      }
      idat.push(Buffer.from(payload))
    } else if (type === 'IEND') {
      if (!header || !seenIDAT || seenIEND || len !== 0 || offset !== raw.length) {
        throw new RangeError('Invalid PNG end marker')
      }
      seenIEND = true
    } else {
      if (seenIDAT) endedIDAT = true
      // Unknown critical PNG chunks must not be silently discarded.
      if (type[0] === type[0]!.toUpperCase()) {
        throw new RangeError('Unsupported critical PNG chunk')
      }
    }
  }
  if (!header || !seenIEND) throw new RangeError('Incomplete PNG')
  const rowSize = width * pixelBytes + 1
  const expectedLength = rowSize * height
  if (expectedLength > 20 * 1024 * 1024) {
    throw new RangeError('PNG raster exceeds decompression limit')
  }
  let decoded: Buffer
  try {
    decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedLength + 1 })
  } catch {
    throw new RangeError('Invalid PNG compressed pixel stream')
  }
  if (decoded.length !== expectedLength) throw new RangeError('PNG raster length mismatch')
  for (let row = 0; row < height; row++) {
    if (decoded[row * rowSize]! > 4) throw new RangeError('Invalid PNG scanline filter')
  }
  const cleaned = Buffer.concat([
    pngSignature, chunk('IHDR', header), chunk('IDAT', Buffer.concat(idat)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  if (cleaned.length > PRIVATE_PORTFOLIO_MAX_BYTES) {
    throw new RangeError('Sanitized PNG exceeds storage limit')
  }
  return cleaned
}

/** Stream-bounded raw intake: never buffer a multi-megabyte untrusted body
 * before applying the byte limit, including when Content-Length is missing.
 */
export async function readPrivatePortfolioUploadBody(
  request: Request,
  limit = PRIVATE_PORTFOLIO_MAX_BYTES,
): Promise<Buffer> {
  const declared = request.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    throw new RangeError('Private image upload too large')
  }
  if (!request.body) throw new RangeError('Empty private image upload')
  const reader = request.body.getReader()
  const buffers: Buffer[] = []
  let length = 0, completed = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) { completed = true; break }
      length += value.byteLength
      if (length > limit) throw new RangeError('Private image upload too large')
      buffers.push(Buffer.from(value))
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return Buffer.concat(buffers, length)
}
