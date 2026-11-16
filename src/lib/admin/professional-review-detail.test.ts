import assert from 'node:assert/strict'
import test from 'node:test'
import { loadProfessionalReviewDetail } from './professional-review-detail.ts'

const manager = { userId: 12, role: 'location_admin' as const, locationIds: [3] }
const admin = { userId: 8, role: 'admin' as const, locationIds: [] }
type Repo = Parameters<typeof loadProfessionalReviewDetail>[0]
const record = {
  id: 15, barber: 6, location: 3, author: 9, status: 'pending',
  baseRevision: 'a'.repeat(64), createdAt: '2026-11-16T10:00:00Z',
  snapshot: { bio: 'Old summary', secretToken: 'never reveal' },
  changes: {
    bio: 'New summary', portrait: { url: 'private-photo.jpg' },
    certificates: [{ image: 'private-certificate.jpg' }],
  },
}
function fake(revision: Record<string, unknown> = record, barberLocation = 3): Repo {
  return { findByID: async ({ collection }: { collection: string }) => collection === 'barbers'
    ? { id: 6, name: 'Example Barber', location: barberLocation }
    : revision } as unknown as Repo
}

test('only explicitly supported text fields appear in review comparison', async () => {
  const detail = await loadProfessionalReviewDetail(fake(), manager, '15')
  assert.deepEqual(detail.fields, [{ field: 'bio', before: 'Old summary', after: 'New summary' }])
  assert.equal(detail.unsupportedChangeCount, 2)
  assert.equal(detail.barber.name, 'Example Barber')
  assert.doesNotMatch(JSON.stringify(detail), /secretToken|private-photo|private-certificate|author/)
})

test('private draft and foreign location cannot be inspected', async () => {
  await assert.rejects(loadProfessionalReviewDetail(fake(), {
    ...manager, locationIds: [4],
  }, '15'), /outside assigned location/)
  await assert.rejects(loadProfessionalReviewDetail(fake({
    ...record, status: 'draft',
  }), admin, '15'), /private/)
  await assert.rejects(loadProfessionalReviewDetail(fake(record, 4), manager, '15'), /mismatch/)
})

test('invalid identifiers and suspicious draft shapes fail or are redacted', async () => {
  for (const input of ['0', '-1', 'foo', '1.4', '9007199254740993']) {
    await assert.rejects(loadProfessionalReviewDetail(fake(), admin, input), RangeError)
  }
  const detail = await loadProfessionalReviewDetail(fake({
    ...record,
    changes: { bio: { html: 'unsafe' }, localizedBio: 'x'.repeat(8001) },
  }), admin, '15')
  assert.deepEqual(detail.fields, [
    { field: 'bio', before: 'Old summary', after: null },
    { field: 'localizedBio', before: null, after: null },
  ])
})
