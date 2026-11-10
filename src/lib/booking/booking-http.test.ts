import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BookingIdempotencyConflictError } from './idempotency.ts'
import { BookingSlotConflictError } from './booking-errors.ts'
import { bookingHttpError, parseBookingHttpInput } from './booking-http.ts'

const request = {
  barberId: 1, locationId: 2, serviceIds: [3],
  startsAt: '2037-01-02T09:00:00.000Z',
  customerName: 'Customer', customerPhone: '+380671234567',
}
test('accepts validated customer intent and an explicit retry token', () => {
  const input = parseBookingHttpInput(request, 'retry-key-123')
  assert.deepEqual(input.request, request)
  assert.equal(input.idempotencyKey, 'retry-key-123')
  assert.notEqual(input.request, request)
})
test('rejects client-owned pricing, status, scope and unknown fields', () => {
  for (const field of ['totalPrice', 'durationMinutes', 'status', 'idempotencyScope', 'customerId', 'role']) {
    assert.throws(() => parseBookingHttpInput({ ...request, [field]: 1 }, 'retry-key-123'), RangeError)
  }
})
test('rejects missing, weak or persistence-incompatible retry tokens', () => {
  for (const key of [null, '', 'short', 'bad.key.123', 'has space', 'a'.repeat(129)]) {
    assert.throws(() => parseBookingHttpInput(request, key), RangeError)
  }
})
test('rejects invalid request shape without reaching the database', () => {
  for (const body of [null, [], { ...request, serviceIds: [] }, { ...request, startsAt: 'tomorrow' }]) {
    assert.throws(() => parseBookingHttpInput(body, 'retry-key-123'), RangeError)
  }
})
test('maps only known conflicts and validation failures to public errors', () => {
  assert.deepEqual(bookingHttpError(new BookingSlotConflictError()), {
    status: 409, message: 'Selected booking slot is unavailable',
  })
  assert.equal(bookingHttpError(new BookingIdempotencyConflictError())?.status, 409)
  assert.equal(bookingHttpError(new RangeError('bad phone'))?.status, 400)
  assert.equal(bookingHttpError(new Error('database connection failed')), null)
  assert.equal(bookingHttpError({ code: '23505', detail: 'secret SQL' }), null)
})
