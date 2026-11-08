import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateZonedAvailableSlots } from './zoned-availability.ts'

test('converts Kyiv local workday to UTC and filters an existing appointment', () => {
  const slots = calculateZonedAvailableSlots({
    date: '2026-01-15', timeZone: 'Europe/Kyiv',
    shifts: [{ startMinute: 600, endMinute: 720 }],
    blocked: [{ startsAt: new Date('2026-01-15T08:30:00Z'), endsAt: new Date('2026-01-15T09:00:00Z') }],
    durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(slots.map(slot => slot.startsAt), [
    '2026-01-15T08:00:00.000Z',
    '2026-01-15T09:00:00.000Z',
    '2026-01-15T09:30:00.000Z',
  ])
})

test('respects summer offset and does not fabricate missing spring DST times', () => {
  const summer = calculateZonedAvailableSlots({
    date: '2026-07-15', timeZone: 'Europe/Kyiv',
    shifts: [{ startMinute: 600, endMinute: 660 }],
    blocked: [], durationMinutes: 30, stepMinutes: 30,
  })
  assert.equal(summer[0].startsAt, '2026-07-15T07:00:00.000Z')

  const spring = calculateZonedAvailableSlots({
    date: '2026-03-29', timeZone: 'Europe/Kyiv',
    shifts: [{ startMinute: 180, endMinute: 300 }],
    blocked: [], durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(spring.map(slot => slot.localStartMinute), [240, 270])
})

test('returns both UTC occurrences of a repeated fall DST hour', () => {
  const slots = calculateZonedAvailableSlots({
    date: '2026-10-25', timeZone: 'Europe/Kyiv',
    shifts: [{ startMinute: 180, endMinute: 240 }],
    blocked: [], durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(slots.map(slot => slot.startsAt), [
    '2026-10-25T00:00:00.000Z',
    '2026-10-25T00:30:00.000Z',
    '2026-10-25T01:00:00.000Z',
    '2026-10-25T01:30:00.000Z',
  ])
})

test('rejects invalid UTC blocking intervals', () => {
  assert.throws(() => calculateZonedAvailableSlots({
    date: '2026-01-15', timeZone: 'Europe/Kyiv',
    shifts: [{ startMinute: 540, endMinute: 600 }],
    blocked: [{ startsAt: new Date('2026-01-15T10:00:00Z'), endsAt: new Date('2026-01-15T09:00:00Z') }],
    durationMinutes: 30,
  }), RangeError)
})
