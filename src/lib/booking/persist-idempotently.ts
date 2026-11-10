import {
  assertBookingIdempotencyIdentity,
  isBookingIdempotencyUniqueViolation,
  type BookingIdempotency,
} from './idempotency.ts'

export type StoredBookingRetry = {
  idempotency_scope: string | null
  idempotency_key: string | null
  idempotency_request_hash: string | null
}

/**
 * Internal persistence adapter boundary, not a transaction implementation.
 *
 * The caller MUST make insert atomic with its booking row and retry metadata,
 * backed by bookings_idempotency_scope_key_unique. readExisting must query by
 * the trusted scope/key (not by hash), and must use a fresh DB read after the
 * failed insert transaction has been rolled back.
 */
export async function persistBookingIdempotently<T extends StoredBookingRetry>(input: {
  token: BookingIdempotency
  readExisting: (scope: string, key: string) => Promise<T | null>
  insert: () => Promise<T>
}): Promise<T> {
  const { token, readExisting, insert } = input
  const existing = await readExisting(token.scope, token.key)
  if (existing) {
    assertBookingIdempotencyIdentity(token, existing)
    return existing
  }

  try {
    const created = await insert()
    // Never accept an adapter returning a booking for another retry identity.
    assertBookingIdempotencyIdentity(token, created)
    return created
  } catch (error) {
    if (!isBookingIdempotencyUniqueViolation(error)) throw error
    // A concurrent transaction may have committed the same retry key.
    // Only the exact indexed uniqueness error permits this replay path.
    const committed = await readExisting(token.scope, token.key)
    if (!committed) throw error
    assertBookingIdempotencyIdentity(token, committed)
    return committed
  }
}
