import { BookingBodyError, readBookingBody } from './read-booking-body.ts'

export const MAX_BOOKING_STATUS_BODY_BYTES = 128

/**
 * Status mutations share one bounded UTF-8 reader and a strict body shape.
 * This preserves the existing 400/413 response contract for staff actions.
 */
export async function readBookingStatusBody(request: Request): Promise<{ status: unknown }> {
  let body: unknown
  try {
    body = await readBookingBody(request, MAX_BOOKING_STATUS_BODY_BYTES)
  } catch (error) {
    if (error instanceof BookingBodyError && error.status === 413) {
      throw new BookingBodyError(413, 'Request too large')
    }
    throw error
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'status')) {
    throw new BookingBodyError(400, 'Invalid status request')
  }

  return { status: (body as { status: unknown }).status }
}
