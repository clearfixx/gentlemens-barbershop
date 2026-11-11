import assert from 'node:assert/strict'
import test from 'node:test'
import { decideBookingTransition, type BookingActor, type BookingStatus } from './booking-status-policy.ts'
import { resolveBookingActor } from './booking-access.ts'

const start = new Date('2026-11-20T10:00:00.000Z')
const before = new Date('2026-11-20T09:59:59.999Z')
const after = new Date('2026-11-20T10:00:00.000Z')
const statuses: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']
const actors: BookingActor[] = ['customer', 'assigned_barber', 'admin']

function expected(actor: BookingActor, from: BookingStatus, to: BookingStatus, afterStart: boolean, customerMayCancel: boolean) {
  if (['completed', 'cancelled', 'no_show'].includes(from) || from === to) return false
  if (actor === 'customer') {
    return customerMayCancel && (from === 'pending' || from === 'confirmed') && to === 'cancelled'
  }
  if (from === 'pending') return to === 'confirmed' || to === 'cancelled'
  if (from === 'confirmed') {
    return to === 'cancelled' || (afterStart && (to === 'completed' || to === 'no_show'))
  }
  return false
}

test('exhaustive role/status/time/cancellation matrix never allows an unexpected transition', () => {
  for (const actor of actors) {
    for (const from of statuses) {
      for (const to of statuses) {
        for (const afterStart of [false, true]) {
          for (const customerMayCancel of [false, true]) {
            const decision = decideBookingTransition({
              actor, from, to, startsAt: start,
              now: afterStart ? after : before,
              customerCancellationAllowed: customerMayCancel,
            })
            assert.equal(decision.allowed, expected(actor, from, to, afterStart, customerMayCancel),
              `${actor}: ${from} -> ${to}, afterStart=${afterStart}, customerMayCancel=${customerMayCancel}`)
          }
        }
      }
    }
  }
})

test('assigned barber cannot manage another barber’s bookings even if they are also the customer', () => {
  assert.equal(resolveBookingActor({
    principal: { id: 8, role: 'barber' }, bookingCustomerId: 8, assignedBarberUserId: 9,
  }), null)
  assert.equal(resolveBookingActor({
    principal: { id: 8, role: 'barber' }, bookingCustomerId: null, assignedBarberUserId: 8,
  }), 'assigned_barber')
  assert.equal(resolveBookingActor({
    principal: { id: 8, role: 'barber' }, bookingCustomerId: 8, assignedBarberUserId: null,
  }), null)
})

test('unknown roles and invalid principal IDs never obtain booking management access', () => {
  for (const role of ['moderator', 'ADMIN', '', 'guest']) {
    assert.equal(resolveBookingActor({
      principal: { id: 2, role }, bookingCustomerId: 2, assignedBarberUserId: 2,
    }), null)
  }
  for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(resolveBookingActor({
      principal: { id, role: 'admin' }, bookingCustomerId: 2, assignedBarberUserId: 2,
    }), null)
  }
})

test('a terminal booking remains immutable for every role', () => {
  for (const actor of actors) {
    for (const from of ['completed', 'cancelled', 'no_show'] as const) {
      for (const to of statuses) {
        assert.equal(decideBookingTransition({
          actor, from, to, startsAt: start, now: after, customerCancellationAllowed: true,
        }).allowed, false)
      }
    }
  }
})
