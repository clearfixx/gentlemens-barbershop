import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBarberDayAvailability } from './barber-day.ts'

const date = '2026-11-09' // Monday
const weeklyShifts = [
  { weekday: '1', startMinute: 540, endMinute: 660 },
  { weekday: '2', startMinute: 540, endMinute: 660 },
]
const interval = (start: string, end: string) => ({
  startsAt: new Date(start), endsAt: new Date(end),
})

test('only Monday shifts apply on Monday', () => {
  const slots = calculateBarberDayAvailability({
    date, timeZone: 'Europe/Kyiv', weeklyShifts,
    timeOff: [], bookings: [], durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(slots.map(slot => slot.localStartMinute), [540, 570, 600, 630])
})

test('time off and pending or confirmed bookings block slots', () => {
  const slots = calculateBarberDayAvailability({
    date, timeZone: 'Europe/Kyiv', weeklyShifts,
    timeOff: [interval('2026-11-09T08:00:00Z', '2026-11-09T08:30:00Z')],
    bookings: [
      { ...interval('2026-11-09T07:30:00Z', '2026-11-09T08:00:00Z'), status: 'pending' },
      { ...interval('2026-11-09T08:30:00Z', '2026-11-09T09:00:00Z'), status: 'confirmed' },
    ],
    durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(slots.map(slot => slot.localStartMinute), [540])
})

test('cancelled, completed and no-show bookings do not block availability', () => {
  const slots = calculateBarberDayAvailability({
    date, timeZone: 'Europe/Kyiv', weeklyShifts,
    timeOff: [],
    bookings: [
      { ...interval('2026-11-09T07:00:00Z', '2026-11-09T07:30:00Z'), status: 'cancelled' },
      { ...interval('2026-11-09T07:30:00Z', '2026-11-09T08:00:00Z'), status: 'completed' },
      { ...interval('2026-11-09T08:00:00Z', '2026-11-09T08:30:00Z'), status: 'no_show' },
    ],
    durationMinutes: 30, stepMinutes: 30,
  })
  assert.deepEqual(slots.map(slot => slot.localStartMinute), [540, 570, 600, 630])
})

test('non-working days and invalid dates produce no availability or errors', () => {
  assert.deepEqual(calculateBarberDayAvailability({
    date: '2026-11-08', timeZone: 'Europe/Kyiv', weeklyShifts,
    timeOff: [], bookings: [], durationMinutes: 30,
  }), [])
  assert.throws(() => calculateBarberDayAvailability({
    date: '2026-02-30', timeZone: 'Europe/Kyiv', weeklyShifts,
    timeOff: [], bookings: [], durationMinutes: 30,
  }), RangeError)
})
