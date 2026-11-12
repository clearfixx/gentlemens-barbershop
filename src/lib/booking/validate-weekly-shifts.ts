export type WeeklyShift = { weekday?: unknown; startMinute?: unknown; endMinute?: unknown }

/** Reject malformed or overlapping weekly schedules before persistence. */
export function validateWeeklyShifts(value: unknown): void {
  if (value === undefined || value === null) return
  if (!Array.isArray(value)) throw new RangeError('Weekly shifts must be an array')
  const grouped = new Map<string, Array<{ start: number; end: number }>>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new RangeError('Invalid weekly shift')
    }
    const shift = raw as WeeklyShift
    const { weekday, startMinute, endMinute } = shift
    if (typeof weekday !== 'string' || !/^[0-6]$/.test(weekday) ||
      typeof startMinute !== 'number' || !Number.isInteger(startMinute) ||
      typeof endMinute !== 'number' || !Number.isInteger(endMinute) ||
      startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
      throw new RangeError('Invalid weekday or shift minutes')
    }
    const day = grouped.get(weekday) ?? []
    day.push({ start: startMinute, end: endMinute })
    grouped.set(weekday, day)
  }
  for (const day of grouped.values()) {
    day.sort((a, b) => a.start - b.start)
    for (let i = 1; i < day.length; i++) {
      if (day[i].start < day[i - 1].end) {
        throw new RangeError('Shifts for the same weekday must not overlap')
      }
    }
  }
}
