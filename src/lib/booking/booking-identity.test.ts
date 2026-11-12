import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertBookingContactEmail, bookingIdentityScope,
  BookingAuthenticationError, BookingContactMismatchError,
} from './booking-identity.ts'
import { bookingHttpError } from './booking-http.ts'

test('derives stable retry scope only from a verified account actor', () => {
  assert.equal(bookingIdentityScope({ id: 17, role: 'customer' }), 'user:17')
  assert.equal(bookingIdentityScope({ id: 18, role: 'admin' }), 'user:18')
})
test('rejects anonymous, invalid and unauthorized identities', () => {
  for (const actor of [null, undefined, { id: 0, role: 'customer' }, { id: 1.5, role: 'customer' },
    { id: 3, role: 'barber' }, { id: 5, role: 'unknown' }]) {
    assert.throws(() => bookingIdentityScope(actor), BookingAuthenticationError)
  }
})
test('matches contact email case-insensitively without trusting caller identity', () => {
  assert.doesNotThrow(() => assertBookingContactEmail('USER@example.com', 'user@example.com'))
  assert.doesNotThrow(() => assertBookingContactEmail('user@example.com', undefined))
  assert.throws(() => assertBookingContactEmail('user@example.com', 'other@example.com'), BookingContactMismatchError)
  assert.throws(() => assertBookingContactEmail(undefined, 'user@example.com'), BookingAuthenticationError)
})
test('maps identity failures without leaking account details', () => {
  assert.deepEqual(bookingHttpError(new BookingAuthenticationError()), {
    status: 401, message: 'Authentication required',
  })
  assert.deepEqual(bookingHttpError(new BookingContactMismatchError()), {
    status: 403, message: 'Booking contact does not match account',
  })
})
