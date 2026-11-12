import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bookingWritesEnabled } from './booking-write-guard.ts'
import { FixedWindowLimiter } from '../catalog/availability-limiter.ts'

test('production HTTP writes are disabled regardless of test switch', () => {
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'production', BOOKING_WRITE_TEST_MODE: 'enabled' }), false)
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'production' }), false)
})
test('local HTTP writes require explicit opt-in', () => {
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'development' }), false)
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'test', BOOKING_WRITE_TEST_MODE: 'enabled' }), true)
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'development', BOOKING_WRITE_TEST_MODE: 'true' }), false)
})
test('bounded worker budget rejects excess requests without untrusted identity headers', () => {
  const limiter = new FixedWindowLimiter(2, 60_000, 1)
  assert.equal(limiter.check('booking-worker', 100).allowed, true)
  assert.equal(limiter.check('booking-worker', 101).allowed, true)
  assert.deepEqual(limiter.check('booking-worker', 102), { allowed: false, retryAfterSeconds: 60 })
  assert.equal(limiter.check('booking-worker', 60_100).allowed, true)
})
