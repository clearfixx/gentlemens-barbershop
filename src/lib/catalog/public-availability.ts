import { resolveBookingOffering } from '../booking/resolve-offering.ts'

export type AvailabilityInput = { barberId: number; serviceId: number; date: string }

export function parseAvailabilityInput(params: URLSearchParams, now = new Date()): AvailabilityInput {
  if ([...params.keys()].some(key => !['barber', 'service', 'date'].includes(key))) {
    throw new RangeError('Unexpected query parameter')
  }
  const barber = params.getAll('barber')
  const service = params.getAll('service')
  const dates = params.getAll('date')
  if (barber.length !== 1 || service.length !== 1 || dates.length !== 1) {
    throw new RangeError('Expected one barber, service and date')
  }
  const parseId = (value: string): number => {
    if (!/^[1-9]\d{0,8}$/.test(value)) throw new RangeError('Invalid catalog ID')
    return Number(value)
  }
  const date = dates[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Invalid date')
  const utcDay = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(utcDay) || new Date(utcDay).toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid calendar date')
  }
  // Limit expensive availability queries to the near future. UTC bounds have
  // one-day tolerance for users in locations west/east of UTC.
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (utcDay < currentDay - 86400000 || utcDay > currentDay + 31 * 86400000) {
    throw new RangeError('Date outside booking window')
  }
  return { barberId: parseId(barber[0]), serviceId: parseId(service[0]), date }
}

export function resolvePublicDuration(
  barber: { isActive: boolean; serviceOfferings?: Array<{ service: number | { id: number }; durationOverrideMinutes?: number | null; priceOverride?: number | null }> | null },
  service: { id: number; isActive: boolean; price: number; durationMinutes: number },
) {
  if (!barber.isActive) throw new RangeError('Barber unavailable')
  return resolveBookingOffering(service, barber.serviceOfferings ?? [])
}
