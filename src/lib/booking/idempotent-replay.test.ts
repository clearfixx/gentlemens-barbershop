import assert from 'node:assert/strict'
import test from 'node:test'
import { BookingIdempotencyConflictError, type BookingIdempotency } from './idempotency.ts'
import { isIdempotencyUniqueViolation, replayOrCreateBooking } from './idempotent-replay.ts'

const token: BookingIdempotency = {
  scope: 'customer:1', key: 'request-1', requestHash: 'a'.repeat(64),
}
const duplicate = { code: '23505', constraint: 'bookings_idempotency_unique' }

test('new request inserts exactly once', async () => {
  let inserts = 0
  const result = await replayOrCreateBooking({
    token, findExisting: async () => null,
    insert: async () => { inserts++; return { id: 1 } },
  })
  assert.deepEqual(result, { booking: { id: 1 }, replayed: false })
  assert.equal(inserts, 1)
})

test('identical retry returns the existing booking without inserting', async () => {
  const result = await replayOrCreateBooking({
    token,
    findExisting: async () => ({ booking: { id: 1 }, idempotency_request_hash: token.requestHash }),
    insert: async () => { throw new Error('Must not insert') },
  })
  assert.deepEqual(result, { booking: { id: 1 }, replayed: true })
})

test('same key with different request is rejected', async () => {
  await assert.rejects(replayOrCreateBooking({
    token,
    findExisting: async () => ({ booking: { id: 1 }, idempotency_request_hash: 'b'.repeat(64) }),
    insert: async () => { throw new Error('Must not insert') },
  }), BookingIdempotencyConflictError)
})

test('concurrent loser fetches committed winner after unique violation', async () => {
  let reads = 0
  const result = await replayOrCreateBooking({
    token,
    findExisting: async () => {
      reads++
      return reads === 1 ? null : { booking: { id: 9 }, idempotency_request_hash: token.requestHash }
    },
    insert: async () => { throw { cause: duplicate } },
  })
  assert.deepEqual(result, { booking: { id: 9 }, replayed: true })
  assert.equal(reads, 2)
})

test('concurrent loser with changed payload is rejected', async () => {
  let reads = 0
  await assert.rejects(replayOrCreateBooking({
    token,
    findExisting: async () => ++reads === 1 ? null : {
      booking: { id: 9 }, idempotency_request_hash: 'b'.repeat(64),
    },
    insert: async () => { throw duplicate },
  }), BookingIdempotencyConflictError)
})

test('unexpected database failures are not swallowed', async () => {
  const failure = new Error('Connection lost')
  await assert.rejects(replayOrCreateBooking({
    token, findExisting: async () => null, insert: async () => { throw failure },
  }), error => error === failure)
  assert.equal(isIdempotencyUniqueViolation({ code: '23505', constraint: 'other_index' }), false)
})
