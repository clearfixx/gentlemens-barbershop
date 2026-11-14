import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import {
  cancellationCodeHash, confirmGuestCancellation, deliverGuestCancellationCode,
  guestCancellationDeliveryConfigured, GuestCancellationConflictError,
  parseGuestCancellationConfirmation, parseGuestCancellationRequest,
  requestGuestCancellation,
} from './guest-cancellation.ts'

const secret = 'a-strong-guest-cancellation-unit-test-secret'
const code = '03749126'

test('guest cancellation input rejects identity injection and malformed codes', () => {
  assert.deepEqual(parseGuestCancellationRequest({
    bookingId: 7, email: 'GUEST@Example.Invalid',
  }), { bookingId: 7, email: 'guest@example.invalid' })
  assert.deepEqual(parseGuestCancellationConfirmation({ bookingId: 7, code }), { bookingId: 7, code })
  for (const input of [null, [], { bookingId: 7 }, { bookingId: '7', email: 'a@b.co' },
    { bookingId: 7, email: 'a@b.co', customerId: 3 },
    { bookingId: 7, email: 'bad email' }]) {
    assert.throws(() => parseGuestCancellationRequest(input), RangeError)
  }
  for (const invalid of ['1234', 'abcdefgh', '000000000', 3749126]) {
    assert.throws(() => parseGuestCancellationConfirmation({ bookingId: 7, code: invalid }), RangeError)
  }
  assert.throws(() => parseGuestCancellationConfirmation({
    bookingId: 7, code, status: 'cancelled',
  }), RangeError)
})

test('code digest is booking-bound and secret-keyed; delivery is disabled without configuration', () => {
  const digest = cancellationCodeHash(7, code, secret)
  assert.match(digest, /^[a-f0-9]{64}$/)
  assert.notEqual(digest, cancellationCodeHash(8, code, secret))
  assert.notEqual(digest, cancellationCodeHash(7, '00000000', secret))
  assert.ok(!digest.includes(code))
  assert.equal(guestCancellationDeliveryConfigured({}), false)
  assert.equal(guestCancellationDeliveryConfigured({
    PAYLOAD_SECRET: secret, RESEND_API_KEY: 'test-key-at-least-sixteen',
    RESEND_FROM_EMAIL: 'cancel@example.invalid',
  }), true)
})

test('unknown and mismatched booking claims return no delivery but no public distinction', async () => {
  const payload = { db: { drizzle: { execute: async () => ({ rows: [] }) } } } as unknown as Pick<Payload, 'db'>
  let delivered = 0
  await requestGuestCancellation({
    payload, bookingId: 7, email: 'guest@example.invalid', secret, code,
    deliver: async () => { delivered++ },
  })
  assert.equal(delivered, 0)
})

test('only a database-matched challenge delivers the code; delivery failures fail closed', async () => {
  const payload = { db: { drizzle: { execute: async () => ({ rows: [{ booking_id: 7 }] }) } } } as unknown as Pick<Payload, 'db'>
  const received: unknown[] = []
  await requestGuestCancellation({
    payload, bookingId: 7, email: 'guest@example.invalid', secret, code,
    deliver: async (email, sent) => { received.push({ email, code: sent }) },
  })
  assert.deepEqual(received, [{ email: 'guest@example.invalid', code }])
  await assert.rejects(requestGuestCancellation({
    payload, bookingId: 7, email: 'guest@example.invalid', secret, code,
    deliver: async () => { throw new Error('delivery refused') },
  }), /delivery refused/)
})

test('guest confirmation commits failed attempts and accepts only a verified match', async () => {
  const digest = cancellationCodeHash(7, code, secret)
  let executions = 0
  const payload = { db: { drizzle: { transaction: async (callback: (tx: { execute: () => Promise<{rows: unknown[]}> }) => Promise<boolean>) =>
    callback({ execute: async () => {
      executions++
      if (executions === 1) return { rows: [{ code_hash: digest, attempts: 0 }] }
      if (executions === 2) return { rows: [{ id: 7 }] }
      return { rows: [] }
    } }),
  } } } as unknown as Pick<Payload, 'db'>
  assert.deepEqual(await confirmGuestCancellation({ payload, bookingId: 7, code, secret }), {
    id: 7, status: 'cancelled',
  })
  assert.equal(executions, 3)
})

test('invalid and spent challenges cannot cancel; a bad code consumes an attempt', async () => {
  const digest = cancellationCodeHash(7, code, secret)
  let executions = 0
  const payload = { db: { drizzle: { transaction: async (callback: (tx: { execute: () => Promise<{rows: unknown[]}> }) => Promise<boolean>) =>
    callback({ execute: async () => {
      executions++
      return executions === 1 ? { rows: [{ code_hash: digest, attempts: 0 }] } : { rows: [] }
    } }),
  } } } as unknown as Pick<Payload, 'db'>
  await assert.rejects(
    confirmGuestCancellation({ payload, bookingId: 7, code: '12345678', secret }),
    GuestCancellationConflictError,
  )
  assert.equal(executions, 2)
  const spent = { db: { drizzle: { transaction: async (callback: (tx: { execute: () => Promise<{rows: unknown[]}> }) => Promise<boolean>) =>
    callback({ execute: async () => ({ rows: [] }) }),
  } } } as unknown as Pick<Payload, 'db'>
  await assert.rejects(confirmGuestCancellation({ payload: spent, bookingId: 7, code, secret }),
    GuestCancellationConflictError)
})

test('email gateway sends only the code to verified recipient and ignores provider text', async () => {
  let sent: unknown
  await deliverGuestCancellationCode({
    email: 'guest@example.invalid', code, apiKey: 'ci-resend-key', from: 'cancel@example.invalid',
    send: async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    },
  })
  assert.deepEqual((sent as {to: string[]}).to, ['guest@example.invalid'])
  assert.ok(JSON.stringify(sent).includes(code))
  await assert.rejects(deliverGuestCancellationCode({
    email: 'guest@example.invalid', code, apiKey: 'ci-resend-key', from: 'cancel@example.invalid',
    send: async () => new Response('sensitive provider response', { status: 403 }),
  }), /delivery unavailable/)
})
