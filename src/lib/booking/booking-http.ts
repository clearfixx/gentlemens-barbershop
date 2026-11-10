import { BookingIdempotencyConflictError } from './idempotency.ts'
import { BookingSlotConflictError } from './booking-errors.ts'
import { BookingAuthenticationError, BookingContactMismatchError } from './booking-identity.ts'
import { BookingRateLimitedError } from './submit-authenticated-booking.ts'
import { snapshotBookingRequest, type BookingRequest } from './booking-request.ts'

export type BookingHttpInput = { request: BookingRequest; idempotencyKey: string }

/**
 * Strict, transport-only parser. Authentication and identity-derived scope must
 * be enforced separately by the route before invoking the booking service.
 */
export function parseBookingHttpInput(body: unknown, idempotencyKey: string | null): BookingHttpInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RangeError('Invalid booking body')
  }
  const fields = Object.keys(body)
  const allowed = new Set(['barberId', 'locationId', 'serviceIds', 'startsAt', 'customerName', 'customerPhone', 'customerEmail'])
  if (fields.some(field => !allowed.has(field))) throw new RangeError('Unexpected booking field')
  if (typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_:-]{7,127}$/.test(idempotencyKey)) {
    throw new RangeError('Invalid idempotency key')
  }
  return { request: snapshotBookingRequest(body as BookingRequest), idempotencyKey }
}

/** Public HTTP mapping: never leak SQL, Payload, or customer details. */
export function bookingHttpError(error: unknown): { status: number; message: string } | null {
  if (error instanceof BookingRateLimitedError) {
    return { status: 429, message: 'Booking requests temporarily limited' }
  }
  if (error instanceof BookingAuthenticationError) {
    return { status: 401, message: 'Authentication required' }
  }
  if (error instanceof BookingContactMismatchError) {
    return { status: 403, message: 'Booking contact does not match account' }
  }
  if (error instanceof BookingIdempotencyConflictError) {
    return { status: 409, message: 'Idempotency key conflicts with an existing request' }
  }
  if (error instanceof BookingSlotConflictError ||
      (error instanceof RangeError && error.message === 'Selected booking slot is unavailable')) {
    return { status: 409, message: 'Selected booking slot is unavailable' }
  }
  if (error instanceof RangeError) return { status: 400, message: 'Invalid booking request' }
  return null
}
