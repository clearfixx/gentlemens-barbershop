import assert from 'node:assert/strict'
import test from 'node:test'
import { loadProfessionalReviewQueue, parseProfessionalReviewFilters } from './professional-review-queue.ts'

const manager = { userId: 11, role: 'location_admin' as const, locationIds: [2, 4] }
const admin = { userId: 9, role: 'admin' as const, locationIds: [] }

test('queue filters cannot expand manager scope', () => {
  assert.deepEqual(parseProfessionalReviewFilters(manager, {}), {
    status: 'pending', page: 1, locationIds: [2, 4],
  })
  assert.deepEqual(parseProfessionalReviewFilters(admin, { location: '8', status: 'approved' }), {
    status: 'approved', page: 1, locationIds: [8],
  })
  for (const location of ['0', '-2', 'abc', '8']) {
    assert.throws(() => parseProfessionalReviewFilters(manager, { location }))
  }
  for (const status of ['', 'published', 'draft', 'invalid']) {
    assert.throws(() => parseProfessionalReviewFilters(manager, { status }), RangeError)
  }
})

test('review inventory hides private snapshots, author accounts and diffs', async () => {
  let captured: Record<string, unknown> | undefined
  const fake = { find: async (args: Record<string, unknown>) => {
    captured = args
    return {
      docs: [{
        id: 5, barber: 7, location: 2, author: 88,
        snapshot: { bio: 'private pending bio' },
        changes: { portrait: 'private draft photo' },
        baseRevision: 'private-revision', status: 'pending',
        createdAt: '2026-11-16T12:00:00Z',
        rejectionReason: null,
      }],
      totalDocs: 1, totalPages: 1, hasNextPage: false,
    }
  } } as unknown as Parameters<typeof loadProfessionalReviewQueue>[0]
  const result = await loadProfessionalReviewQueue(fake, manager, {})
  assert.equal((captured as Record<string, unknown> | undefined)?.collection,
    'barber-profile-revisions')
  assert.deepEqual((captured as Record<string, unknown> | undefined)?.where, { and: [
    { status: { equals: 'pending' } }, { location: { in: [2, 4] } },
  ] })
  assert.deepEqual(result.rows, [{
    id: 5, barberId: 7, locationId: 2, status: 'pending',
    createdAt: '2026-11-16T12:00:00Z', reviewedAt: null,
    hasRejectionReason: false,
  }])
  assert.doesNotMatch(JSON.stringify(result), /private|author|snapshot|changes|baseRevision/)
})

test('fail closed when returned proposal belongs to a different location', async () => {
  const fake = { find: async () => ({
    docs: [{ id: 1, barber: 3, location: 99, status: 'pending', createdAt: '2026-11-16' }],
    totalDocs: 1, totalPages: 1, hasNextPage: false,
  }) } as unknown as Parameters<typeof loadProfessionalReviewQueue>[0]
  await assert.rejects(loadProfessionalReviewQueue(fake, manager, {}), /Cross-location/)
})
