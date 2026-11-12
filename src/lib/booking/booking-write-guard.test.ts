import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bookingWritesEnabled, checkSharedBookingWriteBudget } from './booking-write-guard.ts'
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

type LimiterPayload = Parameters<typeof checkSharedBookingWriteBudget>[0]
function mockPayload(execute: () => Promise<unknown>): LimiterPayload {
  return { db: { drizzle: { execute } } } as unknown as LimiterPayload
}

test('shared limiter accepts a valid database allowance and computes retry interval', async () => {
  const payload = mockPayload(async () => ({ rows: [{ allowed: true }] }))
  assert.deepEqual(await checkSharedBookingWriteBudget(payload, 61_000), {
    allowed: true, retryAfterSeconds: 59,
  })
})

test('shared limiter rejects a consumed budget with Retry-After', async () => {
  const payload = mockPayload(async () => ({ rows: [{ allowed: false }] }))
  assert.deepEqual(await checkSharedBookingWriteBudget(payload, 119_999), {
    allowed: false, retryAfterSeconds: 1,
  })
})

test('shared limiter fails closed when PostgreSQL is unavailable', async () => {
  const payload = mockPayload(async () => { throw new Error('connection unavailable') })
  await assert.rejects(checkSharedBookingWriteBudget(payload, 60_000), /connection unavailable/)
})

test('shared limiter rejects missing, duplicate and malformed SQL results', async () => {
  for (const rows of [[], [{ allowed: true }, { allowed: true }], [{ allowed: 1 }]]) {
    const payload = mockPayload(async () => ({ rows }))
    await assert.rejects(checkSharedBookingWriteBudget(payload, 60_000), /Invalid shared limiter response/)
  }
})

test('shared limiter rejects an invalid clock before any SQL call', async () => {
  let called = false
  const payload = mockPayload(async () => { called = true; return { rows: [{ allowed: true }] } })
  await assert.rejects(checkSharedBookingWriteBudget(payload, -1), /Invalid limiter clock/)
  assert.equal(called, false)
})
