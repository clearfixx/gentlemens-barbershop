import { createHash } from 'node:crypto'
import { validateBookingRequestShape, type BookingRequest } from './booking-request.ts'

export class BookingIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different booking request')
    this.name = 'BookingIdempotencyConflictError'
  }
}

export type BookingIdempotency = {
  scope: string
  key: string
  requestHash: string
}

/**
 * Hash the original, normalized request intent, not mutable catalog-derived
 * prices. The same retry must keep its identity even if the catalog changes.
 */
export function bookingRequestFingerprint(request: BookingRequest): string {
  validateBookingRequestShape(request)
  const canonical = JSON.stringify({
    barberId: request.barberId,
    locationId: request.locationId,
    serviceIds: request.serviceIds,
    startsAt: new Date(request.startsAt).toISOString(),
    customerName: request.customerName.trim(),
    customerPhone: request.customerPhone.trim(),
    customerEmail: request.customerEmail?.trim() || null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function prepareBookingIdempotency(input: {
  scope: string
  key: string
  request: BookingRequest
}): BookingIdempotency {
  const { scope, key, request } = input
  if (typeof scope !== 'string' || !scope || scope.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(scope)) {
    throw new RangeError('Invalid idempotency scope')
  }
  if (typeof key !== 'string' || !key || key.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new RangeError('Invalid idempotency key')
  }
  return { scope, key, requestHash: bookingRequestFingerprint(request) }
}

export function assertIdempotencyReplay(
  expected: BookingIdempotency,
  existing: { idempotency_request_hash: string | null },
): void {
  if (existing.idempotency_request_hash !== expected.requestHash) {
    throw new BookingIdempotencyConflictError()
  }
}
