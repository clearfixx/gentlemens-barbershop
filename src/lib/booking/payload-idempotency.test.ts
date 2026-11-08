import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import { BookingIdempotencyConflictError } from './idempotency.ts'
import { persistIdempotentPayloadBooking } from './payload-idempotency.ts'

const quote: BookingQuote = {
  barberId: 3, locationId: 2, serviceIds: [7],
  startsAt: '2030-01-02T09:00:00.000Z',
  endsAt: '2030-01-02T10:00:00.000Z',
  durationMinutes: 60, totalPrice: 500,
  customerName: 'Customer', customerPhone: '+380671234567',
}
const token = { scope: 'customer:1', key: 'request-1', requestHash: 'a'.repeat(64) }

test('existing Payload booking is replayed without creating a second booking', async () => {
  let creates = 0
  const payload = {
    find: async () => ({ docs: [{ id: 42, idempotencyRequestHash: token.requestHash }] }),
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
    find: async () => ({ docs: [{ id: 42, idempotencyRequestHash: 'b'.repeat(64) }] }),
    create: async () => { throw Error('Must not create') },
  } as unknown as Payload
  await assert.rejects(persistIdempotentPayloadBooking(payload, quote, token),
    BookingIdempotencyConflictError)
})

test('unique-index race recovers the winner through a second Payload read', async () => {
  let reads = 0
  const payload = {
    find: async () => ({ docs: ++reads === 1 ? [] : [
      { id: 42, idempotencyRequestHash: token.requestHash },
    ] }),
    create: async () => { throw { code: '23505', constraint: 'bookings_idempotency_unique' } },
  } as unknown as Payload
  const result = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(result.booking.id, 42)
  assert.equal(result.replayed, true)
  assert.equal(reads, 2)
})
