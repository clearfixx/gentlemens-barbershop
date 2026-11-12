/**
 * Authenticated booking identity must come from a verified Payload user,
 * never from request JSON, headers, or a caller-supplied user ID.
 */
export type BookingActor = { id: number; role: string }

export function bookingIdentityScope(actor: BookingActor | null | undefined): string {
  if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !['customer', 'admin'].includes(actor.role)) {
    throw new BookingAuthenticationError()
  }
  return `user:${actor.id}`
}

export class BookingAuthenticationError extends Error {
  constructor() {
    super('An authenticated customer account is required')
    this.name = 'BookingAuthenticationError'
  }
}

/** Ensure the booking contact cannot impersonate a different account. */
export function assertBookingContactEmail(
  accountEmail: string | null | undefined,
  bookingEmail: string | undefined,
): void {
  if (typeof accountEmail !== 'string' || !accountEmail.trim()) {
    throw new BookingAuthenticationError()
  }
  if (bookingEmail && bookingEmail.trim().toLowerCase() !== accountEmail.trim().toLowerCase()) {
    throw new BookingContactMismatchError()
  }
}

export class BookingContactMismatchError extends Error {
  constructor() {
    super('Booking email must match the authenticated account')
    this.name = 'BookingContactMismatchError'
  }
}

export class BookingRateLimitedError extends Error {
  constructor() {
    super('Booking requests temporarily limited')
    this.name = 'BookingRateLimitedError'
  }
}
