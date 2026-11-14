import assert from 'node:assert/strict'
import test from 'node:test'
import { getOwnBookingHistory } from '../booking/get-own-booking-history.ts'

test('next visit is queried ascending, active and owner-scoped', async () => {
  let query: Record<string, unknown> | undefined
  const payload = { find: async (args: Record<string, unknown>) => {
    query = args
    return { docs: [], hasNextPage: false, totalPages: 0 }
  } }
  const result = await getOwnBookingHistory(payload as never, { id: 7, role: 'customer' }, {
    filter: 'upcoming', activeOnly: true, ascending: true, limit: 1,
    now: new Date('2026-11-14T10:00:00.000Z'),
  })
  assert.equal(result.bookings.length, 0)
  assert.deepEqual(query?.sort, ['startsAt', 'id'])
  assert.deepEqual(query?.where, { and: [
    { customer: { equals: 7 } },
    { status: { in: ['pending', 'confirmed'] } },
    { startsAt: { greater_than_equal: '2026-11-14T10:00:00.000Z' } },
  ] })
  assert.equal(query?.limit, 1)
})
test('untrusted actors cannot query future bookings', async () => {
  let called = false
  const payload = { find: async () => { called = true; throw Error('Must not query') } }
  await assert.rejects(() => getOwnBookingHistory(payload as never, { id: 4, role: 'barber' }, { activeOnly: true }), /authenticated/i)
  assert.equal(called, false)
})
