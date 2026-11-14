import assert from 'node:assert/strict'
import test from 'node:test'
import { relationshipId, resolveBookingActor } from './booking-access.ts'

test('only the booking owner, assigned barber or administrator may act', () => {
  const context = { bookingCustomerId: 4, assignedBarberUserId: 8 }
  assert.equal(resolveBookingActor({ ...context, principal: { id: 4, role: 'customer' } }), 'customer')
  assert.equal(resolveBookingActor({ ...context, principal: { id: 8, role: 'barber' } }), 'assigned_barber')
  assert.equal(resolveBookingActor({ ...context, principal: { id: 2, role: 'admin' } }), 'admin')
  assert.equal(resolveBookingActor({ ...context, principal: { id: 5, role: 'customer' } }), null)
  assert.equal(resolveBookingActor({ ...context, principal: { id: 7, role: 'barber' } }), null)
  assert.equal(resolveBookingActor({ ...context, principal: { id: 8, role: 'customer' } }), null)
  assert.equal(resolveBookingActor({ ...context, principal: null }), null)
})

test('guest bookings cannot be claimed by an unrelated authenticated customer', () => {
  assert.equal(resolveBookingActor({
    principal: { id: 4, role: 'customer' },
    bookingCustomerId: null,
    assignedBarberUserId: 8,
  }), null)
})

test('relationship extraction rejects malformed identifiers', () => {
  assert.equal(relationshipId(3), 3)
  assert.equal(relationshipId({ id: 3 }), 3)
  for (const value of [0, -1, 1.5, '3', {}, null, { id: '3' }]) {
    assert.equal(relationshipId(value), null)
  }
})
