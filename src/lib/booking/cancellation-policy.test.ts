import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CANCELLATION_DEADLINE_MINUTES,
  canCustomerCancelBooking,
  isValidCancellationDeadlineMinutes,
  resolveCancellationDeadlineMinutes,
} from './cancellation-policy.ts'

test('missing policy defaults to 60 minutes', () => {
  assert.equal(resolveCancellationDeadlineMinutes(undefined), DEFAULT_CANCELLATION_DEADLINE_MINUTES)
  assert.equal(resolveCancellationDeadlineMinutes(null), 60)
})

test('admin-configured minute values are validated', () => {
  for (const value of [0, 30, 60, 120, 10080]) {
    assert.equal(isValidCancellationDeadlineMinutes(value), true)
    assert.equal(resolveCancellationDeadlineMinutes(value), value)
  }
  for (const value of [-1, 1.5, NaN, Infinity, 10081, '60', true]) {
    assert.equal(isValidCancellationDeadlineMinutes(value), false)
    assert.throws(() => resolveCancellationDeadlineMinutes(value))
  }
})

test('deadline is inclusive at the exact cutoff and exclusive after', () => {
  const startsAt = '2026-11-13T08:00:00.000Z'
  assert.equal(canCustomerCancelBooking({
    startsAt, now: new Date('2026-11-13T07:00:00.000Z'), deadlineMinutes: 60,
  }), true)
  assert.equal(canCustomerCancelBooking({
    startsAt, now: new Date('2026-11-13T07:00:00.001Z'), deadlineMinutes: 60,
  }), false)
})

test('policy changes affect subsequent checks, including existing bookings', () => {
  const startsAt = '2026-11-13T08:00:00.000Z'
  const now = new Date('2026-11-13T07:15:00.000Z')
  assert.equal(canCustomerCancelBooking({ startsAt, now, deadlineMinutes: 60 }), false)
  assert.equal(canCustomerCancelBooking({ startsAt, now, deadlineMinutes: 30 }), true)
  assert.equal(canCustomerCancelBooking({ startsAt, now, deadlineMinutes: 120 }), false)
})

test('invalid timestamps or policy fail closed', () => {
  assert.equal(canCustomerCancelBooking({
    startsAt: 'invalid', now: new Date(), deadlineMinutes: 60,
  }), false)
  assert.equal(canCustomerCancelBooking({
    startsAt: '2026-11-13T08:00:00.000Z', now: new Date('invalid'), deadlineMinutes: 60,
  }), false)
  assert.equal(canCustomerCancelBooking({
    startsAt: '2026-11-13T08:00:00.000Z', now: new Date(), deadlineMinutes: -1,
  }), false)
})
