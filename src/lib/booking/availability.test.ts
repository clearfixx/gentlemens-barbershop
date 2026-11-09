import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateAvailableSlots } from './availability.ts'

test('generates starts aligned to the requested step and contained in the shift', () => {
  assert.deepEqual(calculateAvailableSlots({
    shifts: [{ startMinute: 545, endMinute: 630 }],
    blocked: [], durationMinutes: 45, stepMinutes: 15,
  }), [555, 570, 585])
})

test('excludes overlapping bookings and time off while retaining adjacent appointments', () => {
  assert.deepEqual(calculateAvailableSlots({
    shifts: [{ startMinute: 540, endMinute: 720 }],
    blocked: [{ startMinute: 600, endMinute: 630 }],
    durationMinutes: 30, stepMinutes: 30,
  }), [540, 570, 630, 660, 690])
})

test('deduplicates overlapping shifts and sorts start times', () => {
  assert.deepEqual(calculateAvailableSlots({
    shifts: [{ startMinute: 600, endMinute: 660 }, { startMinute: 540, endMinute: 660 }],
    blocked: [], durationMinutes: 30, stepMinutes: 30,
  }), [540, 570, 600, 630])
})

test('rejects invalid intervals and durations', () => {
  assert.throws(() => calculateAvailableSlots({
    shifts: [{ startMinute: 900, endMinute: 540 }], blocked: [], durationMinutes: 30,
  }), RangeError)
  assert.throws(() => calculateAvailableSlots({
    shifts: [], blocked: [], durationMinutes: 0,
  }), RangeError)
})

test('returns no slots when the service does not fit', () => {
  assert.deepEqual(calculateAvailableSlots({
    shifts: [{ startMinute: 540, endMinute: 570 }], blocked: [], durationMinutes: 45,
  }), [])
})
