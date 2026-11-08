export type MinuteInterval = { startMinute: number; endMinute: number }

export type AvailabilityInput = {
  shifts: MinuteInterval[]
  blocked: MinuteInterval[]
  durationMinutes: number
  stepMinutes?: number
}

// Pure calculation for a single local calendar day. The caller must convert
// bookings and time-off intervals to that day's local minutes before invoking.
export function calculateAvailableSlots({
  shifts,
  blocked,
  durationMinutes,
  stepMinutes = 15,
}: AvailabilityInput): number[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || !Number.isInteger(stepMinutes) || stepMinutes <= 0) {
    throw new RangeError('Duration and step must be positive whole minutes.')
  }
  for (const interval of [...shifts, ...blocked]) {
    if (!Number.isInteger(interval.startMinute) || !Number.isInteger(interval.endMinute) ||
        interval.startMinute < 0 || interval.endMinute > 1440 || interval.startMinute >= interval.endMinute) {
      throw new RangeError('Intervals must be within one day and end after they start.')
    }
  }
  const slots = new Set<number>()
  for (const shift of shifts) {
    const first = Math.ceil(shift.startMinute / stepMinutes) * stepMinutes
    for (let start = first; start + durationMinutes <= shift.endMinute; start += stepMinutes) {
      const end = start + durationMinutes
      if (blocked.every(interval => end <= interval.startMinute || start >= interval.endMinute)) {
        slots.add(start)
      }
    }
  }
  return [...slots].sort((a, b) => a - b)
}
