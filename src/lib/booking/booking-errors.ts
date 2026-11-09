/**
 * PostgreSQL exclusion violations use SQLSTATE 23P01.
 * Drivers and Payload may wrap the original database error in a cause chain.
 * Only the expected booking constraint is translated to a slot conflict.
 */
export class BookingSlotConflictError extends Error {
  constructor() {
    super('The selected appointment slot is no longer available')
    this.name = 'BookingSlotConflictError'
  }
}

export function isBookingOverlapViolation(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error

  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (value.code === '23P01' && value.constraint === 'bookings_no_active_overlap') {
      return true
    }
    current = value.cause
  }
  return false
}

export function throwBookingConflictIfApplicable(error: unknown): never {
  if (isBookingOverlapViolation(error)) throw new BookingSlotConflictError()
  throw error
}
