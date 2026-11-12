import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import { BookingIdempotencyConflictError, bookingRequestFingerprint } from './idempotency.ts'
import { persistIdempotentPayloadBooking } from './payload-idempotency.ts'

const quote: BookingQuote = {
  barberId: 3, locationId: 2, serviceIds: [7],
  startsAt: '2030-01-02T09:00:00.000Z',
  endsAt: '2030-01-02T10:00:00.000Z',
  durationMinutes: 60, totalPrice: 500,
  customerName: 'Customer', customerPhone: '+380671234567',
}
const token = { scope: 'customer:1', key: 'request-1', requestHash: bookingRequestFingerprint(quote) }

test('existing Payload booking is replayed without creating a second booking', async () => {
  let creates = 0
  const payload = {
    find: async () => ({ docs: [{ id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash }] }),
    create: async () => { creates++; throw Error('Must not create') },
  } as unknown as Payload
  const result = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(result.booking.id, 42)
  assert.equal(result.replayed, true)
  assert.equal(creates, 0)
})

test('new booking persists token in the same Payload create call', async () => {
  let data: Record<string, unknown> | undefined
  const payload = {
    find: async () => ({ docs: [] }),
    create: async (args: { data: Record<string, unknown> }) => {
      data = args.data
      return { id: 43 }
    },
  } as unknown as Payload
  const result = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(result.replayed, false)
  assert.equal(result.booking.id, 43)
  assert.equal(data?.idempotencyKey, token.key)
  assert.equal(data?.idempotencyRequestHash, token.requestHash)
})

test('different payload on same key fails without insertion', async () => {
  const payload = {
    find: async () => ({ docs: [{ id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: 'b'.repeat(64) }] }),
    create: async () => { throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError)
})

test('unique-index race recovers the winner through a second Payload read', async () => {
  let reads = 0
  const payload = {
    find: async () => ({ docs: ++reads === 1 ? [] : [
      { id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
    ] }),
    create: async () => { throw { code: '23505', constraint: 'bookings_idempotency_unique' } },
  } as unknown as Payload
  const result = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(result.booking.id, 42)
  assert.equal(result.replayed, true)
  assert.equal(reads, 2)
})

test('slot exclusion race replays the same key when the winner committed', async () => {
  let reads = 0
  const payload = {
    find: async () => ({ docs: ++reads === 1 ? [] : [
      { id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
    ] }),
    create: async () => { throw { code: '23P01', constraint: 'bookings_no_active_overlap' } },
  } as unknown as Payload
  const result = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(result.booking.id, 42)
  assert.equal(result.replayed, true)
})

test('unrelated slot exclusion remains a booking conflict', async () => {
  const payload = {
    find: async () => ({ docs: [] }),
    create: async () => { throw { code: '23P01', constraint: 'bookings_no_active_overlap' } },
  } as unknown as Payload
  await assert.rejects(persistIdempotentPayloadBooking(payload, quote, token),
    { name: 'BookingSlotConflictError' })
})

test('slot exclusion race never replays a different request fingerprint', async () => {
  let reads = 0
  const payload = {
    find: async () => ({ docs: ++reads === 1 ? [] : [
      { id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: 'b'.repeat(64) },
    ] }),
    create: async () => { throw { code: '23P01', constraint: 'bookings_no_active_overlap' } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError,
  )
  assert.equal(reads, 2)
})

test('Payload replay refuses a mismatched scope even when the fingerprint matches', async () => {
  const payload = {
    find: async () => ({ docs: [{
      id: 42,
      idempotencyScope: 'customer:other',
      idempotencyKey: token.key,
      idempotencyRequestHash: token.requestHash,
    }] }),
    create: async () => { throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError,
  )
})

test('Payload replay refuses a mismatched key even when the fingerprint matches', async () => {
  const payload = {
    find: async () => ({ docs: [{
      id: 42,
      idempotencyScope: token.scope,
      idempotencyKey: 'other-request',
      idempotencyRequestHash: token.requestHash,
    }] }),
    create: async () => { throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError,
  )
})

test('Payload retry lookup requests two rows to detect missing unique index', async () => {
  let lookupLimit: number | undefined
  const payload = {
    find: async (args: { limit: number }) => {
      lookupLimit = args.limit
      return { docs: [] }
    },
    create: async () => ({ id: 44 }),
  } as unknown as Payload
  await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(lookupLimit, 2)
})

test('duplicate retry rows fail closed instead of replaying an arbitrary booking', async () => {
  let creates = 0
  const payload = {
    find: async () => ({ docs: [
      { id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
      { id: 43, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
    ] }),
    create: async () => { creates++; throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError,
  )
  assert.equal(creates, 0)
})

test('duplicate retry rows after a unique conflict are never silently replayed', async () => {
  let reads = 0
  const payload = {
    find: async () => ({ docs: ++reads === 1 ? [] : [
      { id: 42, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
      { id: 43, idempotencyScope: token.scope, idempotencyKey: token.key, idempotencyRequestHash: token.requestHash },
    ] }),
    create: async () => { throw { code: '23505', constraint: 'bookings_idempotency_unique' } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError,
  )
  assert.equal(reads, 2)
})

test('inconsistent retry fingerprint fails before reading or writing Payload', async () => {
  let calls = 0
  const payload = {
    find: async () => { calls++; return { docs: [] } },
    create: async () => { calls++; return { id: 42 } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, { ...token, requestHash: '0'.repeat(64) }),
    BookingIdempotencyConflictError,
  )
  assert.equal(calls, 0)
})

test('quote changes cannot reuse a retry fingerprint from the original request', async () => {
  let calls = 0
  const payload = {
    find: async () => { calls++; return { docs: [] } },
    create: async () => { calls++; return { id: 42 } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, { ...quote, serviceIds: [8] }, token),
    BookingIdempotencyConflictError,
  )
  assert.equal(calls, 0)
})

test('invalid retry scope and key are rejected before Payload I/O', async () => {
  let calls = 0
  const payload = {
    find: async () => { calls++; return { docs: [] } },
    create: async () => { calls++; return { id: 42 } },
  } as unknown as Payload

  for (const invalid of [
    { ...token, scope: '' },
    { ...token, scope: 'customer:1 OR 1=1' },
    { ...token, key: '' },
    { ...token, key: ' '.repeat(5) },
    { ...token, key: 'a'.repeat(161) },
  ]) {
    await assert.rejects(
      persistIdempotentPayloadBooking(payload, quote, invalid),
      RangeError,
    )
  }
  assert.equal(calls, 0)
})

test('malformed quote is rejected before Payload I/O even with a valid retry token', async () => {
  let calls = 0
  const payload = {
    find: async () => { calls++; return { docs: [] } },
    create: async () => { calls++; return { id: 42 } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, {
      ...quote, startsAt: 'not-a-date',
    }, token),
    RangeError,
  )
  assert.equal(calls, 0)
})

test('inconsistent quote interval cannot replay an existing booking', async () => {
  let reads = 0
  const payload = {
    find: async () => { reads++; return { docs: [{
      id: 42, idempotencyScope: token.scope,
      idempotencyKey: token.key, idempotencyRequestHash: token.requestHash,
    }] } },
  } as unknown as Payload
  await assert.rejects(
    persistIdempotentPayloadBooking(payload, {
      ...quote, endsAt: '2030-01-02T09:30:00.000Z',
    }, token),
    RangeError,
  )
  assert.equal(reads, 0)
})
