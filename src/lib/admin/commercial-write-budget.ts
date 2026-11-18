import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

/** Shared, database-atomic staff mutation budget.
 * Uses the existing versioned limiter function but separate keys from booking
 * traffic so administrative actions cannot starve customer reservations.
 * Never derive the identity from X-Forwarded-For, arbitrary request JSON or
 * another client-controlled field.
 */
export async function checkCommercialWriteBudget(
  payload: Pick<Payload, 'db'>,
  authenticatedUserId: number,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!Number.isSafeInteger(authenticatedUserId) || authenticatedUserId <= 0 ||
      !Number.isSafeInteger(now) || now < 0) {
    throw new Error('Invalid staff rate limiter input')
  }
  const windowMs = 60_000
  const actorKey = `admin:commercial:user:${authenticatedUserId}`
  const result = await payload.db.drizzle.execute(sql`
    SELECT
      booking_rate_limit_consume('admin:commercial:global', ${now}, ${windowMs}, 100) AS global_allowed,
      booking_rate_limit_consume(${actorKey}, ${now}, ${windowMs}, 12) AS actor_allowed
  `)
  if (result.rows.length !== 1 ||
      typeof result.rows[0]?.global_allowed !== 'boolean' ||
      typeof result.rows[0]?.actor_allowed !== 'boolean') {
    throw new Error('Invalid staff rate limiter response')
  }
  return {
    allowed: result.rows[0].global_allowed && result.rows[0].actor_allowed,
    retryAfterSeconds: Math.ceil((windowMs - (now % windowMs)) / 1000),
  }
}
