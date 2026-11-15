import assert from 'node:assert/strict'
import test from 'node:test'
import { getOwnBookingHistory } from '../booking/get-own-booking-history.ts'

test('dashboard visit history is completed-only, bounded and scoped to the authenticated customer', async () => {
  let found: Record<string, unknown> | undefined
  const payload = { find: async (query: Record<string, unknown>) => {
    found = query
    return { docs: [], totalPages: 0, hasNextPage: false }
  } }
  await getOwnBookingHistory(payload as never, { id: 23, role: 'customer' },
    { filter: 'past', completedOnly: true, limit: 2, now: new Date('2026-11-15T00:00:00.000Z') })
  assert.deepEqual(found?.where, { and: [
    { customer: { equals: 23 } },
    { status: { equals: 'completed' } },
    { startsAt: { less_than: '2026-11-15T00:00:00.000Z' } },
  ] })
  assert.equal(found?.limit, 2)
  assert.equal(found?.overrideAccess, true)
})

test('conflicting status filters are rejected before accessing storage', async () => {
  let called = false
  const payload = { find: async () => { called = true; throw Error('unexpected') } }
  await assert.rejects(() => getOwnBookingHistory(payload as never,
    { id: 12, role: 'customer' }, { activeOnly: true, completedOnly: true }), RangeError)
  assert.equal(called, false)
})
