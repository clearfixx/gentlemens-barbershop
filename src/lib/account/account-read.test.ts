import assert from 'node:assert/strict'
import test from 'node:test'
import { bookingWritesEnabled } from '../booking/booking-write-guard.ts'
import { getOwnBookingHistory } from '../booking/get-own-booking-history.ts'

// Account reads must remain available even if appointment writes are disabled.
test('production booking write gate stays closed', () => {
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'production', BOOKING_WRITE_TEST_MODE: 'enabled' }), false)
  assert.equal(bookingWritesEnabled({ NODE_ENV: 'development' }), false)
})

test('account history rejects unauthenticated principals', async () => {
  let called = false
  const fakePayload = { find: async () => { called = true; throw new Error('unexpected call') } }
  await assert.rejects(() => getOwnBookingHistory(fakePayload as never, null), /authenticated/i)
  assert.equal(called, false)
})

test('account history refuses an invalid requested page', async () => {
  const fakePayload = { find: async () => { throw new Error('unexpected call') } }
  await assert.rejects(() => getOwnBookingHistory(fakePayload as never, { id: 1, role: 'customer' }, { page: 1001 }), RangeError)
})
