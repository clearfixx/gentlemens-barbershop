import assert from 'node:assert/strict'
import test from 'node:test'
import { assertLocationAccess, resolveLocationScope } from './location-access.ts'

type StubPayload = Parameters<typeof resolveLocationScope>[0]

test('network admin can read all locations without querying assignments', async () => {
  const payload = { find: () => { throw new Error('not expected') } } as unknown as StubPayload
  const scope = await resolveLocationScope(payload, { id: 9, role: 'admin' })
  assert.deepEqual(scope, { userId: 9, role: 'admin', locationIds: [] })
  assert.doesNotThrow(() => assertLocationAccess(scope, 200))
})

test('location admin receives only server-assigned active locations', async () => {
  let calls = 0
  const payload = { find: async (query: { where: unknown; page: number }) => {
    calls++
    assert.equal(query.page, 1)
    assert.deepEqual(query.where, { and: [
      { user: { equals: 11 } }, { isActive: { equals: true } },
    ] })
    return { docs: [
      { user: 11, location: 2 },
      { user: 11, location: 4 },
      { user: 11, location: 2 },
    ], hasNextPage: false }
  } } as unknown as StubPayload
  const scope = await resolveLocationScope(payload, { id: 11, role: 'location_admin' })
  assert.deepEqual(scope.locationIds, [2, 4])
  assert.equal(calls, 1)
  assert.doesNotThrow(() => assertLocationAccess(scope, 4))
  assert.throws(() => assertLocationAccess(scope, 3), /forbidden/)
})

test('fails closed for customers, missing assignments and identity mismatches', async () => {
  const none = { find: async () => ({ docs: [], hasNextPage: false }) } as unknown as StubPayload
  await assert.rejects(resolveLocationScope(none, { id: 1, role: 'customer' }), /forbidden/)
  await assert.rejects(resolveLocationScope(none, { id: 1, role: 'location_admin' }), /No active/)
  const malicious = { find: async () => ({
    docs: [{ user: 88, location: 2 }], hasNextPage: false,
  }) } as unknown as StubPayload
  await assert.rejects(resolveLocationScope(malicious, { id: 1, role: 'location_admin' }), /ownership mismatch/)
})

test('continues paginated assignments without trusting the request body', async () => {
  const pages: number[] = []
  const payload = { find: async ({ page }: { page: number }) => {
    pages.push(page)
    return page === 1
      ? { docs: [{ user: 11, location: 2 }], hasNextPage: true }
      : { docs: [{ user: 11, location: 8 }], hasNextPage: false }
  } } as unknown as StubPayload
  assert.deepEqual(
    (await resolveLocationScope(payload, { id: 11, role: 'location_admin' })).locationIds, [2, 8],
  )
  assert.deepEqual(pages, [1, 2])
})
