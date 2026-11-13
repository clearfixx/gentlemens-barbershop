export type BookingWizardSlot = { startsAt: string; endsAt: string }

export type BookingWizardAvailability = {
  barberId: number
  locationId: number
  serviceIds: number[]
  date: string
  timeZone: string
  price: number
  durationMinutes: number
  slots: BookingWizardSlot[]
}

/** Date-only inputs are shop-local; booking slots themselves remain UTC instants. */
export function bookingLocalDateWindow(now: string, timeZone: string): {
  today: string
  maxDate: string
} {
  const date = new Date(now)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid booking clock')
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(date)
  const field = (type: string) => parts.find(item => item.type === type)?.value
  const year = Number(field('year'))
  const month = Number(field('month'))
  const day = Number(field('day'))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError('Invalid shop-local date')
  }
  const today = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
  const maxDate = new Date(Date.UTC(year, month - 1, day + 30)).toISOString().slice(0, 10)
  return { today, maxDate }
}

/** Fail closed on stale or corrupted responses before rendering or selecting slots. */
export function isBookingWizardAvailability(
  value: unknown,
  expected: { barberId: number; locationId: number; serviceIds: number[]; date: string },
): value is BookingWizardAvailability {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (item.barberId !== expected.barberId || item.locationId !== expected.locationId ||
      item.date !== expected.date || !Array.isArray(item.serviceIds) ||
      item.serviceIds.length !== expected.serviceIds.length ||
      !item.serviceIds.every((id, index) => id === expected.serviceIds[index]) ||
      typeof item.timeZone !== 'string' || typeof item.price !== 'number' ||
      !Number.isSafeInteger(item.price) || item.price < 0 ||
      typeof item.durationMinutes !== 'number' || !Number.isSafeInteger(item.durationMinutes) || item.durationMinutes < 5 ||
      item.durationMinutes > 480 || !Array.isArray(item.slots)) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: item.timeZone })
  } catch {
    return false
  }
  return item.slots.every((slot: unknown) => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false
    const data = slot as Record<string, unknown>
    if (typeof data.startsAt !== 'string' || typeof data.endsAt !== 'string') return false
    const start = Date.parse(data.startsAt)
    const end = Date.parse(data.endsAt)
    return Number.isFinite(start) && Number.isFinite(end) &&
      new Date(start).toISOString() === data.startsAt &&
      new Date(end).toISOString() === data.endsAt &&
      end - start === (item.durationMinutes as number) * 60_000
  })
}

export function isBookingWizardReceipt(value: unknown): value is { id: number; replayed: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Number.isSafeInteger(item.id) && (item.id as number) > 0 &&
    typeof item.replayed === 'boolean'
}
