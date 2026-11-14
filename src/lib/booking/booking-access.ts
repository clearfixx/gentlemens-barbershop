import type { BookingActor } from './booking-status-policy.ts'

export type BookingPrincipal = { id: number; role: string }

export function resolveBookingActor(input: {
  principal: BookingPrincipal | null
  bookingCustomerId: number | null
  assignedBarberUserId: number | null
}): BookingActor | null {
  const { principal, bookingCustomerId, assignedBarberUserId } = input
  if (!principal || !Number.isSafeInteger(principal.id) || principal.id <= 0) return null
  if (principal.role === 'admin') return 'admin'
  if (principal.role === 'barber' && assignedBarberUserId === principal.id) return 'assigned_barber'
  if (principal.role === 'customer' && bookingCustomerId === principal.id) return 'customer'
  return null
}

/** Relationship IDs must be read from trusted server-side records, not the request body. */
export function relationshipId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (value && typeof value === 'object' && 'id' in value) {
    return relationshipId(value.id)
  }
  return null
}
