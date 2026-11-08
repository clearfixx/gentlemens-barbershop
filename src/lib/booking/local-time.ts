// Convert UTC instants to minute intervals in the location's calendar day.
// Callers should query instants across a sufficiently broad UTC window.
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let result = formatterCache.get(timeZone)
  if (!result) {
    result = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    formatterCache.set(timeZone, result)
  }
  return result
}

export function localDayMinute(instant: Date, timeZone: string): { date: string; minute: number } {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid instant')
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map(part => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

// Walk in absolute time, so repeated local minutes on DST fall-back are
// included, and missing minutes on spring-forward are never fabricated.
// This is intended for mapping blocked UTC intervals to a local-day slot grid.
export function blockedMinutesForLocalDay(
  startsAt: Date,
  endsAt: Date,
  date: string,
  timeZone: string,
): Array<{ startMinute: number; endMinute: number }> {
  const start = startsAt.getTime()
  const end = endsAt.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new RangeError('Invalid blocked interval')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Invalid local date')
  const blocked = new Set<number>()
  // UTC minute boundaries avoid rounding issues for standard minute-aligned bookings.
  for (let instant = Math.floor(start / 60000) * 60000; instant < end; instant += 60000) {
    const segmentStart = Math.max(instant, start)
    const segmentEnd = Math.min(instant + 60000, end)
    if (segmentStart >= segmentEnd) continue
    const local = localDayMinute(new Date(segmentStart), timeZone)
    if (local.date === date) blocked.add(local.minute)
  }
  const sorted = [...blocked].sort((a, b) => a - b)
  const result: Array<{ startMinute: number; endMinute: number }> = []
  for (const minute of sorted) {
    const last = result[result.length - 1]
    if (last && last.endMinute === minute) last.endMinute++
    else result.push({ startMinute: minute, endMinute: minute + 1 })
  }
  return result
}


// Resolve a wall-clock start into all matching UTC instants. During spring DST
// gaps there are no matches; during autumn fall-back there can be two.
export function utcInstantsForLocalMinute(date: string, minute: number, timeZone: string): Date[] {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !Number.isInteger(minute) || minute < 0 || minute >= 1440) {
    throw new RangeError('Invalid local date or minute')
  }
  const midnight = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid local calendar date')
  }
  const matches: Date[] = []
  // All real-world IANA offsets fit within ±24h. Search UTC day ±24h.
  for (let timestamp = midnight - 86400000; timestamp < midnight + 172800000; timestamp += 60000) {
    const local = localDayMinute(new Date(timestamp), timeZone)
    if (local.date === date && local.minute === minute) matches.push(new Date(timestamp))
  }
  return matches
}
