import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertBookingStatus,
  assertBookingStatusTransition,
  bookingStatuses,
} from './booking-lifecycle.ts'

test('recognizes the five persisted booking statuses', () => {
  assert.deepEqual(bookingStatuses, ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])
  for (const status of bookingStatuses) assert.doesNotThrow(() => assertBookingStatus(status))
  for (const status of [null, undefined, '', 'done', 'new', 'confirmed ', 1]) {
    assert.throws(() => assertBookingStatus(status), /Invalid booking status/)
  }
})

test('permits the approved booking lifecycle', () => {
  const allowed: Array<[string, string]> = [
    ['pending', 'confirmed'],
    ['pending', 'cancelled'],
    ['confirmed', 'completed'],
    ['confirmed', 'cancelled'],
    ['confirmed', 'no_show'],
  ]
  for (const [from, to] of allowed) {
    assert.doesNotThrow(() => assertBookingStatusTransition(from, to))
  }
  // An unchanged status on an ordinary record edit is not a transition.
  for (const status of bookingStatuses) {
    assert.doesNotThrow(() => assertBookingStatusTransition(status, status))
  }
})

test('prevents skipping confirmation and reopening terminal bookings', () => {
  for (const from of bookingStatuses) {
    for (const to of bookingStatuses) {
      if (from === to) continue
      const allowed = (from === 'pending' && ['confirmed', 'cancelled'].includes(to)) ||
        (from === 'confirmed' && ['completed', 'cancelled', 'no_show'].includes(to))
      if (!allowed) {
        assert.throws(() => assertBookingStatusTransition(from, to), /Invalid booking status transition/)
      }
    }
  }
})

test('rejects invalid existing or proposed status even on a no-op', () => {
  assert.throws(() => assertBookingStatusTransition('unknown', 'unknown'), /Invalid booking status/)
  assert.throws(() => assertBookingStatusTransition('pending', undefined), /Invalid booking status/)
})
