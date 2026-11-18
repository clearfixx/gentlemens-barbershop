import assert from 'node:assert/strict'
import test from 'node:test'
import { loadBarberAdminDirectory, parseBarberAdminFilters } from './barber-directory.ts'

const manager = { userId: 11, role: 'location_admin' as const, locationIds: [2, 4] }
const network = { userId: 1, role: 'admin' as const, locationIds: [] }

test('barber directory filters are constrained to assigned branches', () => {
  assert.deepEqual(parseBarberAdminFilters(manager, { location: '4', search: ' Alex ', page: '2' }),
    { locationIds: [4], page: 2, search: 'Alex' })
  assert.equal(parseBarberAdminFilters(network, {}).locationIds, null)
  assert.throws(() => parseBarberAdminFilters(manager, { location: '8' }), /forbidden/)
  assert.throws(() => parseBarberAdminFilters(manager, { page: '0' }), RangeError)
  assert.throws(() => parseBarberAdminFilters(manager, { search: 'a'.repeat(81) }), RangeError)
})

test('manager sees only scoped staff fields without user IDs or unpublished content', async () => {
  const fake = { find: async (query: { where: unknown; limit: number }) => {
    assert.deepEqual(query.where, { and: [{ location: { in: [4] } }] })
    assert.equal(query.limit, 20)
    return {
      docs: [{
        id: 21, name: 'Alex', slug: 'alex', location: 4, isActive: true,
        user: 99, portrait: 6, bio: 'Professional barber',
        serviceOfferings: [{ service: 2 }],
        privateNotes: 'secret', proposedBiography: 'unapproved draft',
      }],
      totalDocs: 1, totalPages: 1, hasNextPage: false,
    }
  } } as unknown as Parameters<typeof loadBarberAdminDirectory>[0]
  const found = await loadBarberAdminDirectory(fake, manager, { location: '4' })
  assert.deepEqual(found.rows, [{
    id: 21, name: 'Alex', slug: 'alex', locationId: 4, active: true,
    linkedAccount: true, hasPortrait: true, hasBiography: true, offeringCount: 1,
  }])
  assert.doesNotMatch(JSON.stringify(found), /99|secret|unapproved draft/)
})

test('cross-location records fail closed even after a compromised query', async () => {
  const fake = { find: async () => ({
    docs: [{ id: 21, name: 'Alex', slug: 'alex', location: 800, isActive: true }],
    totalDocs: 1, totalPages: 1, hasNextPage: false,
  }) } as unknown as Parameters<typeof loadBarberAdminDirectory>[0]
  await assert.rejects(loadBarberAdminDirectory(fake, manager, {}), /Cross-location/)
})
