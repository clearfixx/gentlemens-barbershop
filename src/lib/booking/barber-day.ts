import { calculateZonedAvailableSlots, type UtcInterval, type ZonedSlot } from './zoned-availability.ts'
import type { MinuteInterval } from './availability.ts'

export type WeeklyShift = MinuteInterval & { weekday: string }
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type BookingInterval = UtcInterval & { status: BookingStatus }

export function calculateBarberDayAvailability(input: {
  date: string
  timeZone: string
  weeklyShifts: WeeklyShift[]
  timeOff: UtcInterval[]
  bookings: BookingInterval[]
  durationMinutes: number
  stepMinutes?: number
}): ZonedSlot[] {
  const { date, timeZone, weeklyShifts, timeOff, bookings, durationMinutes, stepMinutes } = input
  const dayStart = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayStart.getTime()) ||
      dayStart.toISOString().slice(0, 10) !== date) throw new RangeError('Invalid calendar date')
  // ISO UTC date is only used to derive the weekday of the local calendar date.
  const weekday = String(dayStart.getUTCDay())
  const shifts = weeklyShifts.filter(shift => shift.weekday === weekday)
  const occupied = bookings.filter(booking => booking.status === 'pending' || booking.status === 'confirmed')
  return calculateZonedAvailableSlots({
    date, timeZone,
    shifts,
    blocked: [...timeOff, ...occupied],
    durationMinutes, stepMinutes,
  })
}
