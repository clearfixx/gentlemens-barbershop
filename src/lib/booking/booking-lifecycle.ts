/**
 * Server-owned booking lifecycle. Terminal states are immutable: a cancelled,
 * completed or missed appointment must never silently reserve a slot again.
 */
export const bookingStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const
export type BookingStatus = (typeof bookingStatuses)[number]

const allowedNext: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function assertBookingStatus(value: unknown): asserts value is BookingStatus {
  if (typeof value !== 'string' || !bookingStatuses.includes(value as BookingStatus)) {
    throw new RangeError('Invalid booking status')
  }
}

export function assertBookingStatusTransition(previous: unknown, next: unknown): void {
  assertBookingStatus(previous)
  assertBookingStatus(next)
  if (previous !== next && !allowedNext[previous].includes(next)) {
    throw new RangeError('Invalid booking status transition')
  }
}

/**
 * Appointments are immutable after creation except for status and notes.
 * Rescheduling / repricing must use a separately validated service and a
 * new availability check, not a generic Payload collection update.
 */
const mutableFields = new Set(['status', 'notes'])

export function assertBookingUpdateAllowed(
  originalStatus: unknown,
  data: Record<string, unknown>,
): void {
  for (const key of Object.keys(data)) {
    if (!mutableFields.has(key)) {
      throw new RangeError('Booking appointment fields cannot be edited directly')
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'status')) {
    assertBookingStatusTransition(originalStatus, data.status)
  }
}
