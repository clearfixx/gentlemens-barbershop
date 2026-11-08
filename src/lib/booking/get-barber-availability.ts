import type { Payload } from 'payload'
import { calculateBarberDayAvailability } from './barber-day.ts'

// Server-only availability lookup. Do not expose it as a public route until
// booking creation has transactional conflict protection.
export async function getBarberAvailability(input: {
  payload: Payload
  barberId: number
  date: string
  durationMinutes: number
}) {
  const { payload, barberId, date, durationMinutes } = input
  if (!Number.isInteger(barberId) || barberId <= 0) throw new RangeError('Invalid barber ID')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Invalid date')
  const day = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid calendar date')
  }
  // ±48 hours safely covers the local day across all IANA time zones.
  const from = new Date(day.getTime() - 48 * 3600000).toISOString()
  const to = new Date(day.getTime() + 72 * 3600000).toISOString()

  const barber = await payload.findByID({ collection: 'barbers', id: barberId, depth: 0 })
  if (!barber.isActive) return []
  const locationId = typeof barber.location === 'number' ? barber.location : barber.location.id
  const location = await payload.findByID({ collection: 'locations', id: locationId, depth: 0 })
  if (!location.isActive) return []
  const timeZone = location.timeZone
  if (!timeZone) throw new Error('Location timezone is required')

  const [schedules, timeOff, bookings] = await Promise.all([
    payload.find({
      collection: 'barber-schedules', depth: 0, limit: 100, overrideAccess: true,
      where: { and: [{ barber: { equals: barberId } }, { isActive: { equals: true } }] },
    }),
    payload.find({
      collection: 'barber-time-off', depth: 0, limit: 500, overrideAccess: true,
      where: { and: [
        { barber: { equals: barberId } },
        { startsAt: { less_than: to } },
        { endsAt: { greater_than: from } },
      ] },
    }),
    payload.find({
      collection: 'bookings', depth: 0, limit: 500, overrideAccess: true,
      where: { and: [
        { barber: { equals: barberId } },
        { startsAt: { less_than: to } },
        { endsAt: { greater_than: from } },
        { status: { in: ['pending', 'confirmed'] } },
      ] },
    }),
  ])
  // Never show an incomplete schedule if a query hits its safety limit.
  if (schedules.hasNextPage || timeOff.hasNextPage || bookings.hasNextPage) {
    throw new Error('Availability query exceeded its safe result limit')
  }
  return calculateBarberDayAvailability({
    date, timeZone, durationMinutes,
    weeklyShifts: schedules.docs.flatMap(schedule =>
      (schedule.weeklyShifts ?? []).map((shift: { weekday: string; startMinute: number; endMinute: number }) => ({
        weekday: shift.weekday,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
      })),
    ),
    timeOff: timeOff.docs.map(item => ({
      startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt),
    })),
    bookings: bookings.docs.map(item => ({
      startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt),
      status: item.status,
    })),
  })
}
