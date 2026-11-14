import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanGuestCancellationCode,
  guestCancellationCountdown,
  isGuestCancellationResult,
  maskGuestCancellationEmail,
  parseGuestBookingId,
  validGuestCancellationEmail,
} from './guest-cancellation-ui.ts'

test('booking reference is a positive safe integer, never an arbitrary identifier', () => {
  assert.equal(parseGuestBookingId(' 123 '), 123)
  assert.equal(parseGuestBookingId('0007'), 7)
  for (const value of ['', '0', '-1', '1.5', 'GB-123', '1e3', '9999999999999999', '1 2']) {
    assert.equal(parseGuestBookingId(value), null, value)
  }
})

test('email validation enforces the same bounded contact format as server', () => {
  assert.equal(validGuestCancellationEmail(' guest@example.invalid '), true)
  for (const email of ['', 'hello', 'guest@example', 'two names@example.com',
    'a'.repeat(251) + '@example.invalid']) {
    assert.equal(validGuestCancellationEmail(email), false, email.slice(0, 30))
  }
})

test('code entry accepts only eight ASCII digits and supports pasted text', () => {
  assert.equal(cleanGuestCancellationCode('047 9-1263'), '04791263')
  assert.equal(cleanGuestCancellationCode('1'.repeat(12)), '11111111')
  assert.equal(cleanGuestCancellationCode('abcd'), '')
})

test('result can only show success for exact requested booking with cancelled status', () => {
  assert.equal(isGuestCancellationResult({ id: 42, status: 'cancelled' }, 42), true)
  for (const value of [null, {}, [], { id: '42', status: 'cancelled' },
    { id: 43, status: 'cancelled' }, { id: 42, status: 'pending' },
    { id: 42, status: true }]) {
    assert.equal(isGuestCancellationResult(value, 42), false)
  }
})

test('countdown clamps to five minutes and email masking never reveals local-part', () => {
  assert.equal(guestCancellationCountdown(300), '05:00')
  assert.equal(guestCancellationCountdown(272), '04:32')
  assert.equal(guestCancellationCountdown(0), '00:00')
  assert.equal(guestCancellationCountdown(-100), '00:00')
  assert.equal(guestCancellationCountdown(1000), '05:00')
  assert.equal(maskGuestCancellationEmail('guest@example.invalid'), 'g***@example.invalid')
  assert.equal(maskGuestCancellationEmail('invalid'), '')
})
