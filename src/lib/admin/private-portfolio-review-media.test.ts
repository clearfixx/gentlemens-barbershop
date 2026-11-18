import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  listPrivatePortfolioReviewMedia,
  readPrivatePortfolioReviewImage,
  PrivatePortfolioMediaNotFound,
} from './private-portfolio-review-media.ts'

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
const row = {
  content: image, mime_type: 'image/png', size_bytes: image.length,
  sha256: createHash('sha256').update(image).digest('hex'),
}
type DB = Parameters<typeof readPrivatePortfolioReviewImage>[0]
function fake(rows: Array<Record<string, unknown>>): DB {
  return { db: { drizzle: { execute: async () => ({ rows }) } } } as unknown as DB
}

test('reject malformed IDs and actors before reading bytes', async () => {
  for (const id of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(readPrivatePortfolioReviewImage(fake([row]), {
      id: 7, role: 'admin',
    }, 5, id), RangeError)
  }
  await assert.rejects(readPrivatePortfolioReviewImage(fake([row]), {
    id: 0, role: 'admin',
  }, 5, 9), RangeError)
})

test('returns only verified image content for staff authorized by SQL', async () => {
  const data = await readPrivatePortfolioReviewImage(fake([row]), {
    id: 7, role: 'admin',
  }, 5, 9)
  assert.equal(data.mimeType, 'image/png')
  assert.deepEqual(Buffer.from(data.bytes), image)
  const listed = await listPrivatePortfolioReviewMedia(fake([
    { id: 9, mime_type: 'image/png', size_bytes: image.length },
  ]), { id: 7, role: 'admin' }, 5)
  assert.deepEqual(listed, [{ id: 9, mimeType: 'image/png', sizeBytes: image.length }])
  assert.doesNotMatch(JSON.stringify(listed), /content|sha256|file|path/)
})

test('missing, corrupted, oversized and mislabelled images never render', async () => {
  for (const invalid of [
    [],
    [{ ...row, content: Buffer.from('not an image') }],
    [{ ...row, sha256: '0'.repeat(64) }],
    [{ ...row, mime_type: 'image/svg+xml' }],
    [{ ...row, size_bytes: image.length + 1 }],
    [{ ...row, content: Buffer.alloc(5242881), size_bytes: 5242881 }],
  ]) {
    await assert.rejects(readPrivatePortfolioReviewImage(fake(invalid), {
      id: 7, role: 'location_admin',
    }, 5, 9), PrivatePortfolioMediaNotFound)
  }
})

test('abnormally large private image lists fail closed', async () => {
  const rows = Array.from({ length: 31 }, (_, i) => ({
    id: i + 1, mime_type: 'image/png', size_bytes: 70,
  }))
  await assert.rejects(listPrivatePortfolioReviewMedia(fake(rows), {
    id: 7, role: 'admin',
  }, 5), /Excess/)
})
