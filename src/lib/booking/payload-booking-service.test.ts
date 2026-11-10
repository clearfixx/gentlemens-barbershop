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

test('booking service performs all internal availability reads with server access', async () => {
  const reads: Array<{ collection: string; overrideAccess?: boolean }> = []
  const payload = {
    findByID: async (args: { collection: string; overrideAccess?: boolean }) => {
      reads.push(args)
      assert.equal(args.overrideAccess, true)
      if (args.collection === 'barbers') return {
        id: 3, location: 2, isActive: true,
        serviceOfferings: [{ service: 7, priceOverride: 650, durationOverrideMinutes: 60 }],
      }
      if (args.collection === 'locations') return { id: 2, isActive: true, timeZone: 'Europe/Kyiv' }
      if (args.collection === 'services') return { id: 7, isActive: true, price: 500, durationMinutes: 45 }
      throw Error('Unexpected collection')
    },
    find: async (args: { collection: string; overrideAccess?: boolean }) => {
      reads.push(args)
      assert.equal(args.overrideAccess, true)
      if (args.collection === 'barber-schedules') return {
        docs: [{ weeklyShifts: [{ weekday: '3', startMinute: 0, endMinute: 180 }] }],
        hasNextPage: false,
      }
      return { docs: [], hasNextPage: false }
    },
    create: async () => ({ id: 99 }),
  } as unknown as Payload
  await createPayloadBooking(payload, request)
  assert.ok(reads.some(read => read.collection === 'bookings'))
  assert.ok(reads.some(read => read.collection === 'barber-time-off'))
  assert.ok(reads.every(read => read.overrideAccess === true))
})

test('a retry whose slot became unavailable replays only its exact committed booking', async () => {
  const token = prepareBookingIdempotency({ scope: 'customer:42', key: 'lost-slot', request })
  let bookingReads = 0
  let writes = 0
  const payload = {
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === 'barbers') return { id: 3, location: 2, isActive: true, serviceOfferings: [{ service: 7, durationOverrideMinutes: 60 }] }
      if (collection === 'locations') return { id: 2, isActive: true, timeZone: 'Europe/Kyiv' }
      if (collection === 'services') return { id: 7, isActive: true, price: 500, durationMinutes: 45 }
      throw Error('Unexpected collection')
    },
    find: async ({ collection }: { collection: string }) => {
      if (collection === 'bookings') {
        bookingReads++
        return { docs: bookingReads === 1 ? [] : [{
          id: 123, startsAt: request.startsAt, endsAt: '2030-01-01T23:30:00.000Z',
          status: 'pending', idempotencyScope: token.scope,
          idempotencyKey: token.key, idempotencyRequestHash: token.requestHash,
        }], hasNextPage: false }
      }
      if (collection === 'barber-schedules') return {
        docs: [{ weeklyShifts: [{ weekday: '3', startMinute: 0, endMinute: 180 }] }],
        hasNextPage: false,
      }
      return { docs: [], hasNextPage: false }
    },
    create: async () => { writes++; throw Error('Must not create') },
  } as unknown as Payload
  const result = await createIdempotentPayloadBooking(payload, request, token.scope, token.key)
  assert.equal(result.replayed, true)
  assert.equal(result.booking.id, 123)
  assert.equal(writes, 0)
  assert.equal(bookingReads, 3)
})

test('a different booking occupying the slot cannot be replayed as this request', async () => {
  const payload = {
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === 'barbers') return { id: 3, location: 2, isActive: true, serviceOfferings: [{ service: 7, durationOverrideMinutes: 60 }] }
      if (collection === 'locations') return { id: 2, isActive: true, timeZone: 'Europe/Kyiv' }
      if (collection === 'services') return { id: 7, isActive: true, price: 500, durationMinutes: 45 }
      throw Error('Unexpected collection')
    },
    find: async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === 'bookings') {
        const lookup = JSON.stringify(where).includes('idempotencyScope')
        return { docs: lookup ? [] : [{
          id: 456, startsAt: request.startsAt, endsAt: '2030-01-01T23:30:00.000Z',
          status: 'confirmed',
        }], hasNextPage: false }
      }
      if (collection === 'barber-schedules') return {
        docs: [{ weeklyShifts: [{ weekday: '3', startMinute: 0, endMinute: 180 }] }],
        hasNextPage: false,
      }
      return { docs: [], hasNextPage: false }
    },
    create: async () => { throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(
    createIdempotentPayloadBooking(payload, request, 'customer:42', 'occupied-slot'),
    { name: 'RangeError', message: 'Selected booking slot is unavailable' },
  )
})
