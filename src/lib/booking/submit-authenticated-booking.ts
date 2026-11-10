import { assertBookingContactEmail, bookingIdentityScope, type BookingActor } from './booking-identity.ts'
import { parseBookingHttpInput } from './booking-http.ts'
import type { BookingRequest } from './booking-request.ts'

export type VerifiedBookingActor = BookingActor & { email: string }
export type BookingWriteResult<T> = { booking: T; replayed: boolean }

/**
 * Transport-independent application boundary.
 * The adapter must supply a server-verified Payload actor and a rate-limit
 * decision before calling this function. Never accept actor from request JSON.
 */
export async function submitAuthenticatedBooking<T>(input: {
  body: unknown
  idempotencyKey: string | null
  actor: VerifiedBookingActor | null
  allowed: boolean
  create: (request: BookingRequest, scope: string, key: string) => Promise<BookingWriteResult<T>>
}): Promise<BookingWriteResult<T>> {
  if (!input.allowed) throw new BookingRateLimitedError()
  const scope = bookingIdentityScope(input.actor)
  const parsed = parseBookingHttpInput(input.body, input.idempotencyKey)
  assertBookingContactEmail(input.actor?.email, parsed.request.customerEmail)
  return input.create(parsed.request, scope, parsed.idempotencyKey)
}

export class BookingRateLimitedError extends Error {
  constructor() {
    super('Booking requests temporarily limited')
    this.name = 'BookingRateLimitedError'
  }
}
