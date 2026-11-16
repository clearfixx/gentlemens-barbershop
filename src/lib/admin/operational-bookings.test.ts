import assert from 'node:assert/strict'
import test from 'node:test'
import { getOperationalBookings, parseOperationalBookingFilters } from './operational-bookings.ts'

const manager = { userId: 12, role: 'location_admin' as const, locationIds: [2, 3] }
const admin = { userId: 1, role: 'admin' as const, locationIds: [] }

test('booking filters enforce location manager scope before querying', () => {
  assert.deepEqual(parseOperationalBookingFilters(manager, { location: '2', status: 'pending' }), {
    locationIds: [2], status: 'pending', date: undefined, page: 1,
  })
  assert.equal(parseOperationalBookingFilters(admin, {}).locationIds, null)
  assert.throws(() => parseOperationalBookingFilters(manager, { location: '99' }), /forbidden/)
  for (const status of ['wrong', '']) {
    assert.throws(() => parseOperationalBookingFilters(manager, { status }), RangeError)
  }
  for (const date of ['2026-02-30', '2026-01-01T00:00:00', '']) {
    assert.throws(() => parseOperationalBookingFilters(manager, { date }), RangeError)
  }
  for (const page of ['0', '-1', '1000', 'abc']) {
    assert.throws(() => parseOperationalBookingFilters(manager, { page }), RangeError)
  }
})

test('manager inventory excludes private booking metadata and applies strict location filter', async () => {
  let search: Record<string, unknown> | null = null
  const fake = {
    find: async (args: Record<string, unknown>) => {
      search = args
      return {
        docs: [{ id: 8, location: 2, barber: 5, customerName: 'Example',
          customerPhone: 'not-for-manager', customerEmail: 'not-for-manager',
          idempotencyKey: 'secret', notes: 'private note',
          startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z',
          totalPrice: 600, status: 'confirmed' }],
        totalPages: 1, totalDocs: 1, hasNextPage: false,
      }
    },
  } as unknown as Parameters<typeof getOperationalBookings>[0]
  const result = await getOperationalBookings(fake, manager, {
    location: '2', status: 'confirmed', page: '1',
  })
  assert.deepEqual(result.bookings, [{
    id: 8, locationId: 2, barberId: 5, customerName: 'Example',
    startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z',
    totalPrice: 600, status: 'confirmed',
  }])
  assert.equal(search?.limit, 20)
  assert.deepEqual(search?.where, { and: [
    { location: { in: [2] } }, { status: { equals: 'confirmed' } },
  ] })
  assert.doesNotMatch(JSON.stringify(result), /secret|private note|not-for-manager/)
})

test('fails closed if database returns a booking from an unauthorized branch', async () => {
  const fake = {
    find: async () => ({
      docs: [{ id: 8, location: 88, barber: 5, customerName: 'Example',
        startsAt: '2026-11-16T10:00:00Z', endsAt: '2026-11-16T11:00:00Z',
        totalPrice: 600, status: 'pending' }],
      totalPages: 1, totalDocs: 1, hasNextPage: false,
    }),
  } as unknown as Parameters<typeof getOperationalBookings>[0]
  await assert.rejects(getOperationalBookings(fake, manager, {}), /Cross-location/)
  await assert.rejects(getOperationalBookings(fake, manager, { location: '88' }), /forbidden/)
})
