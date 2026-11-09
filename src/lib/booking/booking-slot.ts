import type { BookingQuote } from './booking-request.ts'
import type { ZonedSlot } from './zoned-availability.ts'

/**
 * Compare exact UTC instants, not wall-clock labels, to distinguish repeated
 * local hours during daylight-saving fall-back.
 */
export function assertBookingSlotAvailable(
  quote: Pick<BookingQuote, 'startsAt' | 'endsAt'>,
  availableSlots: ZonedSlot[],
): void {
  const start = Date.parse(quote.startsAt)
  const end = Date.parse(quote.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new RangeError('Invalid booking interval')
  }
  if (!availableSlots.some(slot =>
    slot.startsAt === quote.startsAt && slot.endsAt === quote.endsAt,
  )) {
    throw new RangeError('Selected booking slot is unavailable')
  }
}
