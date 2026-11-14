import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import {
  BookingCancellationConflictError,
  cancelOwnedBooking,
  parseCancellationIdentity,
} from './cancel-owned-booking.ts'

test('accepts only authenticated booking owners and positive safe identifiers', () => {
  assert.deepEqual(parseCancellationIdentity('42', { id: 7, role: 'customer' }), {
    bookingId: 42, customerId: 7,
  })
  for (const id of ['', '0', '-1', '01', '1x', '1.5', '9007199254740992']) {
    assert.throws(() => parseCancellationIdentity(id, { id: 7, role: 'customer' }), RangeError)
  }
  for (const actor of [null, { id: 0, role: 'customer' }, { id: 7, role: 'barber' }]) {
    assert.throws(() => parseCancellationIdentity('42', actor), { name: 'BookingAuthenticationError' })
  }
})

type CancelPayload = Pick<Payload, 'db'>
function payloadFor(rows: unknown[], capture: () => void = () => {}): CancelPayload {
  return {
    db: { drizzle: { execute: async () => { capture(); return { rows } } } },
  } as unknown as CancelPayload
}

test('returns cancellation only when the database changed exactly one booking', async () => {
  let executions = 0
  const result = await cancelOwnedBooking(
    payloadFor([{ id: 42 }], () => { executions++ }),
    '42', { id: 7, role: 'customer' },
  )
  assert.deepEqual(result, { id: 42, status: 'cancelled' })
  assert.equal(executions, 1)
})

test('zero updated rows fail closed without revealing ownership or existence', async () => {
  await assert.rejects(
    cancelOwnedBooking(payloadFor([]), '42', { id: 7, role: 'customer' }),
    BookingCancellationConflictError,
  )
})

test('invalid actors and ids cannot reach persistence', async () => {
  let executions = 0
  const payload = payloadFor([{ id: 42 }], () => { executions++ })
  await assert.rejects(cancelOwnedBooking(payload, 'bad', { id: 7, role: 'customer' }), RangeError)
  await assert.rejects(cancelOwnedBooking(payload, '42', null), { name: 'BookingAuthenticationError' })
  assert.equal(executions, 0)
})

test('unexpected database results never become successful cancellations', async () => {
  for (const rows of [[{ id: 99 }], [{ id: 42 }, { id: 42 }], [{ id: 'not-a-number' }]]) {
    await assert.rejects(cancelOwnedBooking(payloadFor(rows), '42', { id: 7, role: 'customer' }))
  }
})

test('database outages propagate rather than being disguised as booking conflicts', async () => {
  const failure = new Error('database unavailable')
  const payload = {
    db: { drizzle: { execute: async () => { throw failure } } },
  } as unknown as CancelPayload
  await assert.rejects(
    cancelOwnedBooking(payload, '42', { id: 7, role: 'customer' }),
    error => error === failure,
  )
})
