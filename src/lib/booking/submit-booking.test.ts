import assert from 'node:assert/strict'
import { test } from 'node:test'
import { submitBooking, guestBookingScope } from './submit-booking.ts'
import { bookingHttpError } from './booking-http.ts'

const secret = 'ci-only-a-strong-test-secret-at-least-32-bytes'
const token = 'e8f2c48b-0a4f-4f16-9a3d-a8c6f034e42b'
const otherToken = 'bd4619a8-22d5-412f-a7b1-421f9b8ced38'
const body = {
  barberId: 2, locationId: 1, serviceIds: [3, 4],
  startsAt: '2037-01-02T09:00:00.000Z',
  customerName: 'Guest Customer', customerPhone: '+380671234567',
}
const account = { id: 17, role: 'customer', email: 'customer@example.invalid' }

test('guest creates an accountless booking with an opaque, stable retry scope', async () => {
  let called = 0
  const result = await submitBooking({
    body, actor: null, idempotencyKey: token, allowed: true, guestSecret: secret,
    create: async (request, scope, key) => {
      called++
      assert.deepEqual(request, body)
      assert.equal(key, token)
      assert.match(scope, /^guest:[0-9a-f]{64}$/)
      assert.ok(!scope.includes(body.customerPhone))
      assert.ok(!scope.includes(token))
      return { booking: { id: 41 }, replayed: false }
    },
  })
  assert.equal(result.booking.id, 41)
  assert.equal(called, 1)
  assert.equal(guestBookingScope(token, secret), guestBookingScope(token, secret))
  assert.notEqual(guestBookingScope(token, secret), guestBookingScope(otherToken, secret))
  assert.notEqual(guestBookingScope(token, secret), guestBookingScope(token, 'another-secret-that-is-long-enough-to-work'))
})

test('authenticated booking retains its account scope and contact protection', async () => {
  const result = await submitBooking({
    body: { ...body, customerEmail: 'customer@example.invalid' },
    actor: account, idempotencyKey: 'retry-key-123', allowed: true, guestSecret: undefined,
    create: async (_request, scope, key) => {
      assert.equal(scope, 'user:17')
      assert.equal(key, 'retry-key-123')
      return { booking: { id: 42 }, replayed: false }
    },
  })
  assert.equal(result.booking.id, 42)
  let writes = 0
  await assert.rejects(submitBooking({
    body: { ...body, customerEmail: 'other@example.invalid' },
    actor: account, idempotencyKey: 'retry-key-123', allowed: true, guestSecret: secret,
    create: async () => { writes++; return { booking: { id: 99 }, replayed: false } },
  }), error => bookingHttpError(error)?.status === 403)
  assert.equal(writes, 0)
})

test('guest cannot use weak, malformed or non-v4 retry tokens', async () => {
  let calls = 0
  for (const key of [null, 'retry-key-123', 'e8f2c48b-0a4f-1f16-9a3d-a8c6f034e42b',
    'e8f2c48b-0a4f-4f16-0a3d-a8c6f034e42b', '00000000-0000-4000-8000-000000000000']) {
    // The all-zero UUID-looking token is syntactically v4 but not random:
    // this special value must also be rejected to avoid predictable retries.
    if (key?.startsWith('00000000')) continue
    await assert.rejects(submitBooking({
      body, actor: null, idempotencyKey: key, allowed: true, guestSecret: secret,
      create: async () => { calls++; return { booking: {}, replayed: false } },
    }), RangeError)
  }
  assert.equal(calls, 0)
})

test('invalid identity fields and missing server secret fail before creating a guest booking', async () => {
  let calls = 0
  for (const badBody of [{ ...body, customerId: 10 }, { ...body, role: 'admin' },
    { ...body, status: 'confirmed' }, { ...body, totalPrice: 1 }, { ...body, serviceIds: [3, 3] }]) {
    await assert.rejects(submitBooking({
      body: badBody, actor: null, idempotencyKey: token, guestSecret: secret, allowed: true,
      create: async () => { calls++; return { booking: {}, replayed: false } },
    }), RangeError)
  }
  for (const guestSecret of [undefined, 'too-short']) {
    await assert.rejects(submitBooking({
      body, actor: null, idempotencyKey: token, guestSecret, allowed: true,
      create: async () => { calls++; return { booking: {}, replayed: false } },
    }), /Guest booking secret is unavailable/)
  }
  assert.equal(calls, 0)
})

test('shared rate budget failure rejects guests before any write', async () => {
  let calls = 0
  await assert.rejects(submitBooking({
    body, actor: null, idempotencyKey: token, guestSecret: secret, allowed: false,
    create: async () => { calls++; return { booking: {}, replayed: false } },
  }), error => bookingHttpError(error)?.status === 429)
  assert.equal(calls, 0)
})
