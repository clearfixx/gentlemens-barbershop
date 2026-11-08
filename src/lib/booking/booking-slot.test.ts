import assert from 'node:assert/strict'
import test from 'node:test'
import { assertBookingSlotAvailable } from './booking-slot.ts'

const slot = {
  startsAt: '2026-10-25T00:30:00.000Z',
  endsAt: '2026-10-25T01:00:00.000Z',
  localStartMinute: 210,
}

test('accepts an exact UTC interval returned by availability', () => {
  assert.doesNotThrow(() => assertBookingSlotAvailable(slot, [slot]))
})

test('rejects a different UTC instant with the same displayed local time', () => {
  const repeatedHour = {
    startsAt: '2026-10-25T01:30:00.000Z',
    endsAt: '2026-10-25T02:00:00.000Z',
  }
  assert.throws(() => assertBookingSlotAvailable(repeatedHour, [slot]), RangeError)
})

test('rejects slots whose duration differs from the quote', () => {
  assert.throws(() => assertBookingSlotAvailable({
    startsAt: slot.startsAt, endsAt: '2026-10-25T01:15:00.000Z',
  }, [slot]), RangeError)
})

test('rejects empty availability and invalid intervals', () => {
  assert.throws(() => assertBookingSlotAvailable(slot, []), RangeError)
  assert.throws(() => assertBookingSlotAvailable({
    startsAt: slot.endsAt, endsAt: slot.startsAt,
  }, [slot]), RangeError)
})
