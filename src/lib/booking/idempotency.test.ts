import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertIdempotencyReplay,
  BookingIdempotencyConflictError,
  bookingRequestFingerprint,
  prepareBookingIdempotency,
} from './idempotency.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7, 8],
  startsAt: '2030-01-02T09:00:00.000Z',
  customerName: ' Customer ', customerPhone: '+380671234567',
  customerEmail: ' customer@example.com ',
}

test('same normalized request produces the same SHA-256 fingerprint', () => {
  const first = bookingRequestFingerprint(request)
  const second = bookingRequestFingerprint({
    ...request, customerName: 'Customer', customerEmail: 'customer@example.com',
  })
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, second)
})

test('changing service order, time, or customer changes the fingerprint', () => {
  const original = bookingRequestFingerprint(request)
  for (const changed of [
    { ...request, serviceIds: [8, 7] },
    { ...request, startsAt: '2030-01-02T10:00:00.000Z' },
    { ...request, customerPhone: '+380671234568' },
  ]) {
    assert.notEqual(bookingRequestFingerprint(changed), original)
  }
})

test('scope and key are validated before accepting a replay token', () => {
  const token = prepareBookingIdempotency({ scope: 'customer:123', key: 'request_456', request })
  assert.equal(token.requestHash, bookingRequestFingerprint(request))
  assert.throws(() => prepareBookingIdempotency({ scope: '', key: 'request_456', request }), RangeError)
  assert.throws(() => prepareBookingIdempotency({ scope: 'customer:123', key: 'bad key', request }), RangeError)
})

test('replays require the exact original request fingerprint', () => {
  const token = prepareBookingIdempotency({ scope: 'customer:123', key: 'request_456', request })
  assert.doesNotThrow(() => assertIdempotencyReplay(token, { idempotency_request_hash: token.requestHash }))
  assert.throws(
    () => assertIdempotencyReplay(token, { idempotency_request_hash: 'f'.repeat(64) }),
    BookingIdempotencyConflictError,
  )
})


test('equivalent canonical UTC timestamps share the retry fingerprint', () => {
  assert.equal(bookingRequestFingerprint(request), bookingRequestFingerprint({
    ...request, startsAt: '2030-01-02T09:00:00Z',
  }))
})

test('malformed booking intent fails before fingerprinting or replay preparation', () => {
  for (const bad of [null, {}, { ...request, startsAt: 'invalid' },
    { ...request, serviceIds: [7, 7] }, { ...request, customerPhone: null }]) {
    assert.throws(() => bookingRequestFingerprint(bad as never), RangeError)
    assert.throws(() => prepareBookingIdempotency({
      scope: 'customer:123', key: 'retry_123', request: bad as never,
    }), RangeError)
  }
})

test('rejects non-string idempotency scope and key', () => {
  for (const value of [null, 1, {}, []]) {
    assert.throws(() => prepareBookingIdempotency({
      scope: value as never, key: 'retry_123', request,
    }), RangeError)
    assert.throws(() => prepareBookingIdempotency({
      scope: 'customer:123', key: value as never, request,
    }), RangeError)
  }
})
