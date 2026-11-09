import { calculateAvailableSlots, type MinuteInterval } from './availability.ts'
import { localDayMinute } from './local-time.ts'

export type UtcInterval = { startsAt: Date; endsAt: Date }
export type ZonedSlot = { startsAt: string; endsAt: string; localStartMinute: number }

export function calculateZonedAvailableSlots(input: {
  date: string
  timeZone: string
  shifts: MinuteInterval[]
  blocked: UtcInterval[]
  durationMinutes: number
  stepMinutes?: number
}): ZonedSlot[] {
  const { date, timeZone, shifts, blocked, durationMinutes, stepMinutes = 15 } = input
  const localStarts = new Set(calculateAvailableSlots({
    shifts, blocked: [], durationMinutes, stepMinutes,
  }))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
    throw new RangeError('Invalid local date')
  }
  for (const interval of blocked) {
    if (!Number.isFinite(interval.startsAt.getTime()) || !Number.isFinite(interval.endsAt.getTime()) ||
      interval.startsAt >= interval.endsAt) throw new RangeError('Invalid blocked UTC interval')
  }

  // Iterate UTC instants once, including repeated local minutes on DST fall-back.
  // Check actual elapsed duration, not wall-clock subtraction, across DST boundaries.
  const midnight = Date.parse(`${date}T00:00:00Z`)
  const slots: ZonedSlot[] = []
  for (let timestamp = midnight - 86400000; timestamp < midnight + 172800000; timestamp += stepMinutes * 60000) {
    const local = localDayMinute(new Date(timestamp), timeZone)
    if (local.date !== date || !localStarts.has(local.minute)) continue
    const end = timestamp + durationMinutes * 60000
    const endsLocal = localDayMinute(new Date(end), timeZone)
    // A booking cannot extend past its configured local shift, even over DST.
    if (endsLocal.date !== date || !shifts.some(shift =>
      local.minute >= shift.startMinute && endsLocal.minute <= shift.endMinute &&
      endsLocal.minute - local.minute === durationMinutes
    )) continue
    if (blocked.some(interval => timestamp < interval.endsAt.getTime() && end > interval.startsAt.getTime())) continue
    slots.push({
      startsAt: new Date(timestamp).toISOString(),
      endsAt: new Date(end).toISOString(),
      localStartMinute: local.minute,
    })
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
