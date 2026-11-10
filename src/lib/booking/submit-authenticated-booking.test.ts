import assert from 'node:assert/strict'
import { test } from 'node:test'
import { submitAuthenticatedBooking } from './submit-authenticated-booking.ts'
import { bookingHttpError } from './booking-http.ts'

const body = {
  barberId: 1, locationId: 2, serviceIds: [3],
  startsAt: '2037-01-02T09:00:00.000Z',
  customerName: 'Test', customerPhone: '+380671234567',
  customerEmail: 'customer@example.com',
}
const actor = { id: 12, role: 'customer', email: 'customer@example.com' }
test('passes only verified identity scope and validated intent to write adapter', async () => {
  let calls = 0
  const result = await submitAuthenticatedBooking({
    body, actor, allowed: true, idempotencyKey: 'retry-key-123',
    create: async (request, scope, key) => {
      calls++
      assert.deepEqual(request, body)
      assert.equal(scope, 'user:12')
      assert.equal(key, 'retry-key-123')
      return { booking: { id: 77 }, replayed: false }
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.booking.id, 77)
})
test('rejects limited requests before attempting writes', async () => {
  let calls = 0
  await assert.rejects(submitAuthenticatedBooking({
    body, actor, allowed: false, idempotencyKey: 'retry-key-123',
    create: async () => { calls++; return { booking: {}, replayed: false } },
  }), error => bookingHttpError(error)?.status === 429)
  assert.equal(calls, 0)
})
test('rejects unauthenticated and invalid contacts before writes', async () => {
  for (const currentActor of [null, { ...actor, email: 'other@example.com' }]) {
    let calls = 0
    await assert.rejects(submitAuthenticatedBooking({
      body, actor: currentActor, allowed: true, idempotencyKey: 'retry-key-123',
      create: async () => { calls++; return { booking: {}, replayed: false } },
    }), error => [401, 403].includes(bookingHttpError(error)?.status ?? 0))
    assert.equal(calls, 0)
  }
})
test('rejects client-supplied identity, scope, and price before writes', async () => {
  let calls = 0
  await assert.rejects(submitAuthenticatedBooking({
    body: { ...body, idempotencyScope: 'user:999', totalPrice: 1 },
    actor, allowed: true, idempotencyKey: 'retry-key-123',
    create: async () => { calls++; return { booking: {}, replayed: false } },
  }), error => bookingHttpError(error)?.status === 400)
  assert.equal(calls, 0)
})
