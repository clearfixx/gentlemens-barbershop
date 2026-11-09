import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BookingSlotConflictError,
  isBookingOverlapViolation,
  throwBookingConflictIfApplicable,
} from './booking-errors.ts'

test('recognizes the exact booking exclusion violation', () => {
  const error = { code: '23P01', constraint: 'bookings_no_active_overlap' }
  assert.equal(isBookingOverlapViolation(error), true)
  assert.throws(() => throwBookingConflictIfApplicable(error), BookingSlotConflictError)
})

test('recognizes database errors nested under driver causes', () => {
  const error = new Error('Database operation failed', {
    cause: new Error('Insert failed', {
      cause: { code: '23P01', constraint: 'bookings_no_active_overlap' },
    }),
  })
  assert.equal(isBookingOverlapViolation(error), true)
})

test('does not disguise other exclusion constraints or SQL failures', () => {
  for (const error of [
    { code: '23P01', constraint: 'another_constraint' },
    { code: '23505', constraint: 'bookings_no_active_overlap' },
    new Error('Database offline'),
    null,
  ]) {
    assert.equal(isBookingOverlapViolation(error), false)
    assert.throws(() => throwBookingConflictIfApplicable(error), thrown => thrown === error)
  }
})

test('handles cyclic error causes without infinite traversal', () => {
  const error: { cause?: unknown } = {}
  error.cause = error
  assert.equal(isBookingOverlapViolation(error), false)
})
