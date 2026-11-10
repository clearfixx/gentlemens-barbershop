import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import { prepareBookingIdempotency } from './idempotency.ts'
import { createIdempotentPayloadBooking, createPayloadBooking } from './payload-booking-service.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7],
  // UTC previous day, but already the next calendar day in Kyiv.
  startsAt: '2030-01-01T22:30:00.000Z',
  customerName: 'Customer', customerPhone: '+380671234567',
}

test('uses the branch local date and persists a trusted quote', async () => {
  const queries: string[] = []
  let created: Record<string, unknown> | undefined
  const payload = {
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === 'barbers') return {
        id: 3, location: 2, isActive: true,
        serviceOfferings: [{ service: 7, priceOverride: 650, durationOverrideMinutes: 60 }],
      }
      if (collection === 'locations') return {
        id: 2, isActive: true, timeZone: 'Europe/Kyiv',
      }
      if (collection === 'services') return {
        id: 7, isActive: true, price: 500, durationMinutes: 45,
      }
      throw Error('Unexpected collection')
    },
    find: async ({ collection }: { collection: string }) => {
      queries.push(collection)
      if (collection === 'barber-schedules') return {
        docs: [{ weeklyShifts: [{ weekday: '3', startMinute: 0, endMinute: 180 }] }],
        hasNextPage: false,
      }
      return { docs: [], hasNextPage: false }
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      created = data
      return { id: 99, ...data }
    },
  } as unknown as Payload
  const booking = await createPayloadBooking(payload, request)
  assert.equal(booking.id, 99)
  assert.equal(created?.startsAt, request.startsAt)
  assert.equal(created?.endsAt, '2030-01-01T23:30:00.000Z')
  assert.equal(created?.totalPrice, 650)
  assert.deepEqual(queries.sort(), ['barber-schedules', 'barber-time-off', 'bookings'])
})

test('replays an existing booking without querying catalog or availability', async () => {
  const token = prepareBookingIdempotency({ scope: 'customer:42', key: 'retry-1', request })
  const calls: string[] = []
  const payload = {
    find: async ({ collection }: { collection: string }) => {
      calls.push(collection)
      assert.equal(collection, 'bookings')
      return { docs: [{ id: 123, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash }] }
    },
    findByID: async () => { throw Error('Catalog must not be queried on replay') },
    create: async () => { throw Error('Replay must not insert a booking') },
  } as unknown as Payload
  const result = await createIdempotentPayloadBooking(payload, request, token.scope, token.key)
  assert.equal(result.replayed, true)
  assert.equal(result.booking.id, 123)
  assert.deepEqual(calls, ['bookings'])
})

test('rejects a reused key with changed request before catalog lookup', async () => {
  const token = prepareBookingIdempotency({ scope: 'customer:42', key: 'retry-2', request })
  const payload = {
    find: async () => ({ docs: [{ id: 123, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash }] }),
    findByID: async () => { throw Error('Catalog must not be queried') },
    create: async () => { throw Error('Booking must not be created') },
  } as unknown as Payload
  await assert.rejects(
    createIdempotentPayloadBooking(payload, { ...request, customerName: 'Changed' }, token.scope, token.key),
    { name: 'BookingIdempotencyConflictError' },
  )
})

test('service rejects a replay with another owner before querying the catalog', async () => {
  const token = prepareBookingIdempotency({ scope: 'customer:42', key: 'owner-check', request })
  const payload = {
    find: async () => ({ docs: [{ id: 123, idempotencyScope: 'customer:other', idempotencyKey: token.key, idempotencyRequestHash: token.requestHash }] }),
    findByID: async () => { throw Error('No catalog lookup on replay') },
    create: async () => { throw Error('No write on replay') },
  } as unknown as Payload
  await assert.rejects(createIdempotentPayloadBooking(payload, request, token.scope, token.key),
    { name: 'BookingIdempotencyConflictError' })
})

test('service uses a request snapshot across asynchronous retry lookup', async () => {
  const mutable = { ...request, serviceIds: [...request.serviceIds] }
  const token = prepareBookingIdempotency({ scope: 'customer:42', key: 'snapshot-check', request: mutable })
  let started!: () => void
  let release!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const barrier = new Promise<void>(resolve => { release = resolve })
  const payload = {
    find: async () => {
      started()
      await barrier
      return { docs: [{ id: 123, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash }] }
    },
    findByID: async () => { throw Error('No catalog lookup on replay') },
    create: async () => { throw Error('No write on replay') },
  } as unknown as Payload
  const pending = createIdempotentPayloadBooking(payload, mutable, token.scope, token.key)
  await entered
  mutable.serviceIds[0] = 999
  mutable.customerName = 'Changed'
  release()
  const result = await pending
  assert.equal(result.replayed, true)
  assert.equal(result.booking.id, 123)
})
