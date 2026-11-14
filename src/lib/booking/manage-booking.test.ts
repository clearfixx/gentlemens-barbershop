import assert from 'node:assert/strict'
import test from 'node:test'
import { BookingManagementError, parseBookingStatus } from './manage-booking.ts'

test('only known booking status values are accepted', () => {
  for (const status of ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']) {
    assert.equal(parseBookingStatus(status), status)
  }
  for (const status of ['approved', 'deleted', null, 1, {}, 'CONFIRMED']) {
    assert.throws(() => parseBookingStatus(status), BookingManagementError)
  }
})
