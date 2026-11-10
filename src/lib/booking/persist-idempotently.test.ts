import assert from 'node:assert/strict'
import test from 'node:test'
import { persistBookingIdempotently } from './persist-idempotently.ts'
import { BookingIdempotencyConflictError, prepareBookingIdempotency } from './idempotency.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7],
  startsAt: '2030-01-02T09:00:00.000Z',
  customerName: 'Customer', customerPhone: '+380671234567',
}
const token = prepareBookingIdempotency({ scope: 'customer:123', key: 'retry_1', request })
const row = {
  id: 42,
  idempotency_scope: token.scope,
  idempotency_key: token.key,
  idempotency_request_hash: token.requestHash,
}
const uniqueError = { code: '23505', constraint: 'bookings_idempotency_scope_key_unique' }

test('existing retry returns the committed row without inserting', async () => {
  let inserts = 0
  const result = await persistBookingIdempotently({
    token, readExisting: async () => row,
    insert: async () => { inserts++; return row },
  })
  assert.deepEqual(result, row)
  assert.equal(inserts, 0)
})

test('first request inserts when the key has not been used', async () => {
  let reads = 0
  const result = await persistBookingIdempotently({
    token, readExisting: async () => { reads++; return null },
    insert: async () => row,
  })
  assert.deepEqual(result, row)
  assert.equal(reads, 1)
})

test('concurrent same-key insert collision re-reads and replays the committed row', async () => {
  let reads = 0
  const result = await persistBookingIdempotently({
    token,
    readExisting: async () => (++reads === 1 ? null : row),
    insert: async () => { throw uniqueError },
  })
  assert.deepEqual(result, row)
  assert.equal(reads, 2)
})

test('different payload or scope cannot replay a committed row', async () => {
  for (const mismatch of [
    { ...row, idempotency_request_hash: 'f'.repeat(64) },
    { ...row, idempotency_scope: 'customer:456' },
  ]) {
    await assert.rejects(persistBookingIdempotently({
      token, readExisting: async () => mismatch,
      insert: async () => row,
    }), BookingIdempotencyConflictError)
  }
})

test('unique collision with missing committed row preserves original failure', async () => {
  await assert.rejects(persistBookingIdempotently({
    token, readExisting: async () => null,
    insert: async () => { throw uniqueError },
  }), error => error === uniqueError)
})

test('unrelated persistence errors are not swallowed or retried', async () => {
  const failure = { code: '23505', constraint: 'users_email_idx' }
  let reads = 0
  await assert.rejects(persistBookingIdempotently({
    token, readExisting: async () => { reads++; return null },
    insert: async () => { throw failure },
  }), error => error === failure)
  assert.equal(reads, 1)
})

test('insert adapter must return the same retry identity', async () => {
  for (const mismatch of [
    { ...row, idempotency_scope: 'customer:456' },
    { ...row, idempotency_key: 'another_retry' },
    { ...row, idempotency_request_hash: '0'.repeat(64) },
  ]) {
    await assert.rejects(persistBookingIdempotently({
      token, readExisting: async () => null,
      insert: async () => mismatch,
    }), BookingIdempotencyConflictError)
  }
})

test('collision replay rejects a row with mismatched retry identity', async () => {
  let reads = 0
  await assert.rejects(persistBookingIdempotently({
    token,
    readExisting: async () => (++reads === 1 ? null : { ...row, idempotency_key: 'wrong' }),
    insert: async () => { throw uniqueError },
  }), BookingIdempotencyConflictError)
  assert.equal(reads, 2)
})
