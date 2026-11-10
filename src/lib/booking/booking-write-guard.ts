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
