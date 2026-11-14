import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import { getOwnBookingHistory, MAX_BOOKING_HISTORY_PAGE_SIZE } from './get-own-booking-history.ts'

const ownRow = {
  id: 42, customer: 7, location: 2, barber: 3, services: [5, 6],
  startsAt: '2037-01-02T09:00:00.000Z',
  endsAt: '2037-01-02T10:00:00.000Z',
  totalPrice: 650, status: 'confirmed',
  customerPhone: '+380671234567',
  customerEmail: 'private@example.invalid',
  notes: 'Private note',
  idempotencyKey: 'private-retry-key',
}

type ReadPayload = Pick<Payload, 'find'>
function mockPayload(
  rows: unknown[] = [ownRow],
  capture: (args: Record<string, unknown>) => void = () => {},
): ReadPayload {
  return {
    find: async (args: Record<string, unknown>) => {
      capture(args)
      return { docs: rows, totalPages: rows.length ? 1 : 0, hasNextPage: false }
    },
  } as unknown as ReadPayload
}

test('lists only the authenticated account, with a strict public field whitelist', async () => {
  let query: Record<string, unknown> | undefined
  const page = await getOwnBookingHistory(
    mockPayload([ownRow], args => { query = args }),
    { id: 7, role: 'customer' },
  )
  assert.deepEqual(page, {
    bookings: [{
      id: 42, locationId: 2, barberId: 3, serviceIds: [5, 6],
      startsAt: ownRow.startsAt, endsAt: ownRow.endsAt,
      totalPrice: 650, status: 'confirmed',
    }],
    page: 1, totalPages: 1, hasNextPage: false,
  })
  assert.deepEqual(query?.where, { and: [{ customer: { equals: 7 } }] })
  assert.equal(query?.overrideAccess, true)
  assert.equal(query?.depth, 0)
  assert.equal(query?.limit, 20)
  assert.equal(query?.page, 1)
  assert.deepEqual(query?.sort, ['-startsAt', '-id'])
  assert.ok(!JSON.stringify(page).includes('private'))
})

test('filters upcoming and past bookings with a fixed injected clock', async () => {
  const queries: Record<string, unknown>[] = []
  const payload = mockPayload([], args => { queries.push(args) })
  const options = { now: new Date('2036-01-01T12:00:00.000Z') }
  await getOwnBookingHistory(payload, { id: 7, role: 'customer' }, { ...options, filter: 'upcoming' })
  await getOwnBookingHistory(payload, { id: 7, role: 'customer' }, { ...options, filter: 'past' })
  assert.deepEqual(queries[0].where, { and: [
    { customer: { equals: 7 } },
    { startsAt: { greater_than_equal: '2036-01-01T12:00:00.000Z' } },
  ] })
  assert.deepEqual(queries[1].where, { and: [
    { customer: { equals: 7 } },
    { startsAt: { less_than: '2036-01-01T12:00:00.000Z' } },
  ] })
})

test('rejects unauthenticated or barber principals before reading data', async () => {
  let queried = false
  const payload = mockPayload([], () => { queried = true })
  for (const actor of [null, { id: 0, role: 'customer' }, { id: 7, role: 'barber' }]) {
    await assert.rejects(getOwnBookingHistory(payload, actor), { name: 'BookingAuthenticationError' })
  }
  assert.equal(queried, false)
})

test('rejects invalid pagination or filters without database access', async () => {
  let queried = false
  const payload = mockPayload([], () => { queried = true })
  for (const options of [
    { page: 0 }, { page: 1001 }, { page: 1.5 }, { limit: 0 },
    { limit: MAX_BOOKING_HISTORY_PAGE_SIZE + 1 },
    { filter: 'other' as never },
    { now: new Date(Number.NaN) },
  ]) {
    await assert.rejects(getOwnBookingHistory(payload, { id: 7, role: 'customer' }, options), RangeError)
  }
  assert.equal(queried, false)
})

test('refuses leaked foreign or orphaned rows even if the privileged adapter misbehaves', async () => {
  for (const row of [{ ...ownRow, customer: 8 }, { ...ownRow, customer: null }]) {
    await assert.rejects(
      getOwnBookingHistory(mockPayload([row]), { id: 7, role: 'customer' }),
      /booking (history ownership mismatch|relation identifier)/i,
    )
  }
})

test('rejects malformed database results rather than leaking contact fields', async () => {
  for (const row of [
    { ...ownRow, status: 'unknown' },
    { ...ownRow, startsAt: 'yesterday' },
    { ...ownRow, endsAt: ownRow.startsAt },
    { ...ownRow, totalPrice: -1 },
    { ...ownRow, services: [] },
  ]) {
    await assert.rejects(getOwnBookingHistory(mockPayload([row]), { id: 7, role: 'customer' }))
  }
  const oversized = Array.from({ length: 2 }, () => ownRow)
  await assert.rejects(getOwnBookingHistory(mockPayload(oversized), { id: 7, role: 'customer' }, { limit: 1 }),
    /Invalid booking history pagination response/)
})

test('propagates database outages for correct server-side diagnostics', async () => {
  const outage = new Error('database unavailable')
  const payload = { find: async () => { throw outage } } as unknown as ReadPayload
  await assert.rejects(
    getOwnBookingHistory(payload, { id: 7, role: 'customer' }),
    error => error === outage,
  )
})
