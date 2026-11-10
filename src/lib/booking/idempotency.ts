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

/**
 * Identify only the unique index reserved for booking retry keys.
 * Unrelated SQLSTATE 23505 violations must retain their original error.
 */
export function isBookingIdempotencyUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (value.code === '23505' &&
        value.constraint === 'bookings_idempotency_scope_key_unique') return true
    current = value.cause
  }
  return false
}

/**
 * Replay only a row fetched under the exact trusted scope and key.
 * Never trust a hash match alone: two different customers can send the
 * same request payload.
 */
export function assertBookingIdempotencyIdentity(
  expected: BookingIdempotency,
  existing: {
    idempotency_scope: string | null
    idempotency_key: string | null
    idempotency_request_hash: string | null
  },
): void {
  if (existing.idempotency_scope !== expected.scope ||
      existing.idempotency_key !== expected.key) {
    throw new BookingIdempotencyConflictError()
  }
  assertIdempotencyReplay(expected, existing)
}
