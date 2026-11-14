import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { FixedWindowLimiter } from '../catalog/availability-limiter.ts'

/**
 * Worker-wide budget: never use an untrusted forwarded IP header as identity.
 * This is defense in depth, not a cross-instance production rate limit.
 */
const bookingLimiter = new FixedWindowLimiter(20, 60_000, 1)

export function checkBookingWriteBudget(now = Date.now()) {
  return bookingLimiter.check('booking-worker', now)
}

/**
 * Fail closed until a shared/edge rate limiter is configured and reviewed.
 * A local integration environment may explicitly opt in to test HTTP writes.
 */
export function bookingWritesEnabled(environment: {
  NODE_ENV?: string
  BOOKING_WRITE_TEST_MODE?: string
}): boolean {
  return environment.NODE_ENV !== 'production' && environment.BOOKING_WRITE_TEST_MODE === 'enabled'
}

/**
 * Consume one shared deployment-wide budget. A failed DB operation throws:
 * callers must return 503, never fall back to a process-local allowance.
 * Use a single trusted key rather than client-controlled forwarded headers.
 */
export async function checkSharedBookingWriteBudget(
  payload: Pick<Payload, 'db'>,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowMs = 60_000
  const limit = 20
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid limiter clock')
  const result = await payload.db.drizzle.execute(sql`
    SELECT booking_rate_limit_consume(
      'booking:write:global',
      ${now},
      ${windowMs},
      ${limit}
    ) AS allowed
  `)
  const rows = result.rows
  if (rows.length !== 1 || typeof rows[0]?.allowed !== 'boolean') {
    throw new Error('Invalid shared limiter response')
  }
  const remainingMs = windowMs - (now % windowMs)
  return { allowed: rows[0].allowed, retryAfterSeconds: Math.ceil(remainingMs / 1000) }
}
