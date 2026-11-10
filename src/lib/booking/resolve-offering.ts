export type ServiceSnapshot = {
  id: number
  isActive: boolean
  price: number
  durationMinutes: number
}

export type BarberOffering = {
  service: number | { id: number }
  priceOverride?: number | null
  durationOverrideMinutes?: number | null
}

/**
 * Resolve authoritative pricing and duration from server-side catalog records.
 * A customer-supplied price or duration must never be accepted.
 */
export function resolveBookingOffering(
  service: ServiceSnapshot,
  offerings: BarberOffering[],
): { serviceId: number; price: number; durationMinutes: number } {
  if (!Number.isSafeInteger(service.id) || service.id <= 0 || !service.isActive) {
    throw new RangeError('Service is not available')
  }
  if (!Array.isArray(offerings)) throw new RangeError('Invalid barber offerings')
  const matches = offerings.filter(item =>
    item && (typeof item.service === 'number' ? item.service : item.service?.id) === service.id,
  )
  // Duplicate offerings make server-side pricing ambiguous. Fail closed.
  if (matches.length !== 1) throw new RangeError('Missing or ambiguous barber offering')
  const offering = matches[0]
  const price = offering.priceOverride ?? service.price
  const durationMinutes = offering.durationOverrideMinutes ?? service.durationMinutes
  if (!Number.isSafeInteger(price) || price < 0 ||
      !Number.isSafeInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    throw new RangeError('Invalid service pricing or duration')
  }
  return { serviceId: service.id, price, durationMinutes }
}
