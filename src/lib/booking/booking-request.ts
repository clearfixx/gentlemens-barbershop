import { resolveBookingOffering, type BarberOffering, type ServiceSnapshot } from './resolve-offering.ts'

export type BookingRequest = {
  barberId: number
  locationId: number
  serviceIds: number[]
  startsAt: string
  customerName: string
  customerPhone: string
  customerEmail?: string
}

export type BookingQuote = {
  barberId: number
  locationId: number
  serviceIds: number[]
  startsAt: string
  endsAt: string
  totalPrice: number
  durationMinutes: number
  customerName: string
  customerPhone: string
  customerEmail?: string
}

/** Validate untrusted booking input before any catalog or availability I/O. */
export function validateBookingRequestShape(value: unknown): asserts value is BookingRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('Invalid booking request')
  }
  const request = value as Record<string, unknown>
  if (![request.barberId, request.locationId].every(id =>
    typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    throw new RangeError('Invalid barber or location identifier')
  }
  if (!Array.isArray(request.serviceIds) || request.serviceIds.length < 1 ||
      request.serviceIds.length > 10 ||
      !request.serviceIds.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
      new Set(request.serviceIds).size !== request.serviceIds.length) {
    throw new RangeError('Invalid service selection')
  }
  if (typeof request.customerName !== 'string' ||
      !request.customerName.trim() || request.customerName.trim().length > 120 ||
      typeof request.customerPhone !== 'string' ||
      !/^\+?[0-9 ()-]{7,24}$/.test(request.customerPhone.trim())) {
    throw new RangeError('Invalid customer contact details')
  }
  if (request.customerEmail !== undefined &&
      (typeof request.customerEmail !== 'string' ||
       (request.customerEmail.trim() !== '' &&
        (request.customerEmail.trim().length > 254 ||
         !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customerEmail.trim()))))) {
    throw new RangeError('Invalid email')
  }
  if (typeof request.startsAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(request.startsAt)) {
    throw new RangeError('Start must be an explicit UTC timestamp')
  }
  const start = new Date(request.startsAt)
  if (!Number.isFinite(start.getTime()) ||
      (request.startsAt !== start.toISOString() &&
       request.startsAt !== start.toISOString().replace('.000Z', 'Z'))) {
    throw new RangeError('Start must be an explicit UTC timestamp')
  }
}

/** Copy only validated client-owned fields before crossing an async boundary. */
export function snapshotBookingRequest(value: BookingRequest): BookingRequest {
  validateBookingRequestShape(value)
  return {
    barberId: value.barberId,
    locationId: value.locationId,
    serviceIds: [...value.serviceIds],
    startsAt: value.startsAt,
    customerName: value.customerName,
    customerPhone: value.customerPhone,
    ...(value.customerEmail !== undefined ? { customerEmail: value.customerEmail } : {}),
  }
}

/**
 * Validates request shape and derives the complete appointment from trusted
 * catalog data. This does not reserve a slot; the database must still enforce
 * non-overlap at insertion time.
 */
export function prepareBookingRequest(input: {
  request: BookingRequest
  barber: { id: number; locationId: number; isActive: boolean; offerings: BarberOffering[] }
  location: { id: number; isActive: boolean }
  services: ServiceSnapshot[]
}): BookingQuote {
  const { request, barber, location, services } = input
  validateBookingRequestShape(request)
  if (![request.barberId, request.locationId].every(id => Number.isSafeInteger(id) && id > 0) ||
      !barber.isActive || !location.isActive ||
      request.barberId !== barber.id || request.locationId !== location.id ||
      barber.locationId !== location.id) {
    throw new RangeError('Selected barber or location is unavailable')
  }
  // Request shape was validated above. Normalize contact fields once; all
  // catalog-derived fields remain server-owned.
  const customerName = request.customerName.trim()
  const customerPhone = request.customerPhone.trim()
  const customerEmail = request.customerEmail?.trim()
  const start = new Date(request.startsAt)
  if (!Array.isArray(services) || !Array.isArray(barber.offerings)) {
    throw new RangeError('Invalid booking catalog')
  }
  const selected = request.serviceIds.map(id => {
    const matches = services.filter(item => item && item.id === id)
    if (matches.length !== 1) throw new RangeError('Unknown or ambiguous service')
    const service = matches[0]
    return resolveBookingOffering(service, barber.offerings)
  })
  const durationMinutes = selected.reduce((sum, item) => sum + item.durationMinutes, 0)
  const totalPrice = selected.reduce((sum, item) => sum + item.price, 0)
  if (!Number.isSafeInteger(totalPrice) || !Number.isSafeInteger(durationMinutes) ||
      durationMinutes > 480) throw new RangeError('Appointment exceeds allowed limits')
  const endTime = start.getTime() + durationMinutes * 60000
  if (!Number.isFinite(endTime) || Math.abs(endTime) > 8.64e15) {
    throw new RangeError('Booking interval exceeds supported date range')
  }
  const endsAt = new Date(endTime).toISOString()
  return {
    barberId: barber.id, locationId: location.id,
    serviceIds: [...request.serviceIds], startsAt: start.toISOString(), endsAt,
    totalPrice, durationMinutes, customerName, customerPhone,
    ...(customerEmail ? { customerEmail } : {}),
  }
}

/**
 * Validate the derived quote again at the persistence boundary.
 * This does not re-price services or prove availability; those require
 * trusted catalog lookups and PostgreSQL's exclusion constraint.
 */
export function assertBookingQuoteIntegrity(value: BookingQuote): void {
  validateBookingRequestShape(value)
  if (!Number.isSafeInteger(value.durationMinutes) ||
      value.durationMinutes < 5 || value.durationMinutes > 480 ||
      !Number.isSafeInteger(value.totalPrice) || value.totalPrice < 0) {
    throw new RangeError('Invalid booking quote totals')
  }
  if (typeof value.endsAt !== 'string') {
    throw new RangeError('Invalid booking quote interval')
  }
  const start = Date.parse(value.startsAt)
  const end = Date.parse(value.endsAt)
  if (!Number.isFinite(end) || end <= start ||
      new Date(end).toISOString() !== value.endsAt ||
      end - start !== value.durationMinutes * 60_000) {
    throw new RangeError('Invalid booking quote interval')
  }
}
