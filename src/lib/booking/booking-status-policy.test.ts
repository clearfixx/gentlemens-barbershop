import assert from 'node:assert/strict'
import test from 'node:test'
import { decideBookingTransition, type BookingActor, type BookingStatus } from './booking-status-policy.ts'

const startsAt = '2026-11-13T08:00:00.000Z'
const now = new Date('2026-11-13T09:00:00.000Z')
const decide = (actor: BookingActor, from: BookingStatus, to: BookingStatus, allowed = true) =>
  decideBookingTransition({ actor, from, to, startsAt, now, customerCancellationAllowed: allowed })

test('manual confirmation and rejection are limited to staff', () => {
  assert.deepEqual(decide('assigned_barber', 'pending', 'confirmed'), { allowed: true })
  assert.deepEqual(decide('admin', 'pending', 'cancelled'), { allowed: true })
  assert.deepEqual(decide('customer', 'pending', 'confirmed'), { allowed: false, reason: 'forbidden' })
})

test('customer cancellation requires a valid location cutoff', () => {
  assert.deepEqual(decide('customer', 'pending', 'cancelled'), { allowed: true })
  assert.deepEqual(decide('customer', 'confirmed', 'cancelled', false), { allowed: false, reason: 'deadline_passed' })
  assert.deepEqual(decide('customer', 'confirmed', 'completed'), { allowed: false, reason: 'forbidden' })
})

test('completion and no-show are only possible after appointment start', () => {
  for (const to of ['completed', 'no_show'] as const) {
    assert.deepEqual(decide('admin', 'confirmed', to), { allowed: true })
    assert.deepEqual(decideBookingTransition({
      actor: 'assigned_barber', from: 'confirmed', to, startsAt,
      now: new Date('2026-11-13T07:59:59.999Z'), customerCancellationAllowed: true,
    }), { allowed: false, reason: 'too_early' })
  }
})

test('terminal states and illegal transitions are rejected', () => {
  for (const from of ['completed', 'cancelled', 'no_show'] as const) {
    assert.deepEqual(decide('admin', from, 'confirmed'), { allowed: false, reason: 'invalid_transition' })
  }
  assert.deepEqual(decide('admin', 'pending', 'completed'), { allowed: false, reason: 'invalid_transition' })
  assert.deepEqual(decide('admin', 'confirmed', 'pending'), { allowed: false, reason: 'invalid_transition' })
})
