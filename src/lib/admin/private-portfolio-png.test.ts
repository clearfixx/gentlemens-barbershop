import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizePrivatePortfolioPng, readPrivatePortfolioUploadBody } from './private-portfolio-png.ts'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAF3RFWHRjb21tZW50AHNlY3JldC1tZXRhZGF0YdHOKngAAAANSURBVHicY/jPwPAfAAUAAf+JmT0dAAAAAElFTkSuQmCC',
  'base64',
)

test('sanitizes valid PNG and drops ancillary metadata without changing raster', () => {
  const safe = sanitizePrivatePortfolioPng(png)
  assert.ok(safe.byteLength < png.byteLength)
  assert.equal(safe.includes(Buffer.from('secret-metadata')), false)
  assert.equal(safe.includes(Buffer.from('tEXt')), false)
  assert.ok(safe.includes(Buffer.from('IDAT')))
  assert.deepEqual(sanitizePrivatePortfolioPng(safe), safe)
})

test('rejects invalid checksums, trailing data and unsupported pixels', () => {
  const altered = Buffer.from(png)
  altered[32] ^= 0x02
  for (const value of [
    altered,
    Buffer.concat([png, Buffer.from('unsafe-tail')]),
    Buffer.from('not-a-png'),
    Buffer.alloc(5 * 1024 * 1024 + 1),
  ]) assert.throws(() => sanitizePrivatePortfolioPng(value), RangeError)
})

test('stream-bounded upload accepts valid size and aborts excess bytes', async () => {
  const request = new Request('https://example.test/private', {
    method: 'POST', body: png, duplex: 'half',
  } as RequestInit)
  assert.deepEqual(await readPrivatePortfolioUploadBody(request), png)

  const over = new Request('https://example.test/private', {
    method: 'POST', body: new Uint8Array(500), duplex: 'half',
  } as RequestInit)
  await assert.rejects(readPrivatePortfolioUploadBody(over, 100), RangeError)
})
