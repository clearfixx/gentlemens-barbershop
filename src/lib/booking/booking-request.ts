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
  if (![request.barberId, request.locationId].every(id => Number.isSafeInteger(id) && id > 0) ||
      !barber.isActive || !location.isActive ||
      request.barberId !== barber.id || request.locationId !== location.id ||
      barber.locationId !== location.id) {
    throw new RangeError('Selected barber or location is unavailable')
  }
  if (!Array.isArray(request.serviceIds) || request.serviceIds.length < 1 ||
      request.serviceIds.length > 10 || new Set(request.serviceIds).size !== request.serviceIds.length ||
      !request.serviceIds.every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new RangeError('Invalid service selection')
  }
  const customerName = request.customerName?.trim()
  const customerPhone = request.customerPhone?.trim()
  if (!customerName || customerName.length > 120 ||
      !customerPhone || !/^\+?[0-9 ()-]{7,24}$/.test(customerPhone)) {
    throw new RangeError('Invalid customer contact details')
  }
  const customerEmail = request.customerEmail?.trim()
  if (customerEmail && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) {
    throw new RangeError('Invalid email')
  }
  const start = new Date(request.startsAt)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(request.startsAt) ||
      !Number.isFinite(start.getTime()) || start.toISOString() !== new Date(start.getTime()).toISOString()) {
    throw new RangeError('Start must be an explicit UTC timestamp')
  }
  const selected = request.serviceIds.map(id => {
    const service = services.find(item => item.id === id)
    if (!service) throw new RangeError('Unknown service')
    return resolveBookingOffering(service, barber.offerings)
  })
  const durationMinutes = selected.reduce((sum, item) => sum + item.durationMinutes, 0)
  const totalPrice = selected.reduce((sum, item) => sum + item.price, 0)
  if (!Number.isSafeInteger(totalPrice) || !Number.isSafeInteger(durationMinutes) ||
      durationMinutes > 480) throw new RangeError('Appointment exceeds allowed limits')
  const endsAt = new Date(start.getTime() + durationMinutes * 60000).toISOString()
  return {
    barberId: barber.id, locationId: location.id,
    serviceIds: [...request.serviceIds], startsAt: start.toISOString(), endsAt,
    totalPrice, durationMinutes, customerName, customerPhone,
    ...(customerEmail ? { customerEmail } : {}),
  }
}
