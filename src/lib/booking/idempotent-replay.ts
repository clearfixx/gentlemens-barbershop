import { isBookingOverlapViolation } from './booking-errors.ts'
import {
  assertIdempotencyReplay,
  type BookingIdempotency,
} from './idempotency.ts'

export type ExistingBooking<T> = {
  booking: T
  idempotency_request_hash: string | null
}

/**
 * Database adapters must use an atomic insert protected by
 * bookings_idempotency_unique. Never implement insertIfAbsent with an
 * application-level read-then-write check.
 */
export async function replayOrCreateBooking<T>(input: {
  token: BookingIdempotency
  findExisting: (token: BookingIdempotency) => Promise<ExistingBooking<T> | null>
  insert: (token: BookingIdempotency) => Promise<T>
}): Promise<{ booking: T; replayed: boolean }> {
  const existing = await input.findExisting(input.token)
  if (existing) {
    assertIdempotencyReplay(input.token, existing)
    return { booking: existing.booking, replayed: true }
  }

  try {
    return { booking: await input.insert(input.token), replayed: false }
  } catch (error) {
    if (!isIdempotencyUniqueViolation(error) && !isBookingOverlapViolation(error) && !isDatabaseDeadlock(error)) throw error

    // PostgreSQL may report a unique-key conflict, slot exclusion conflict,
    // or a deadlock (40P01) when concurrent inserts check both constraints.
    // The deadlock victim has been rolled back; never retry the insert here.
    // Re-read only the exact idempotency key; an unrelated overlap must
    // retain its original error when no matching winner exists.
    const winner = await input.findExisting(input.token)
    if (!winner) throw error
    assertIdempotencyReplay(input.token, winner)
    return { booking: winner.booking, replayed: true }
  }
}

export function isIdempotencyUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const candidate = current as {
      code?: unknown
      constraint?: unknown
      cause?: unknown
    }
    if (candidate.code === '23505' &&
        candidate.constraint === 'bookings_idempotency_unique') return true
    current = candidate.cause
  }
  return false
}

/** A PostgreSQL deadlock is replayable only when the exact key has a committed winner. */
export function isDatabaseDeadlock(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const candidate = current as { code?: unknown; cause?: unknown }
    if (candidate.code === '40P01') return true
    current = candidate.cause
  }
  return false
}
