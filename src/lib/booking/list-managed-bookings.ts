import type { Payload, Where } from 'payload'
import type { BookingPrincipal } from './booking-access.ts'
import { BookingManagementError } from './manage-booking.ts'

/**
 * Server-derived scopes. A barber's Payload account must be explicitly linked
 * to a barber record; an arbitrary barber ID in the URL is never trusted.
 */
export async function listManagedBookings(input: {
  payload: Payload
  principal: BookingPrincipal
  page?: number
  limit?: number
}) {
  const { payload, principal } = input
  if (!Number.isSafeInteger(principal.id) || principal.id <= 0) {
    throw new BookingManagementError(401, 'Authentication required')
  }
  const page = input.page ?? 1
  const limit = input.limit ?? 20
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new BookingManagementError(400, 'Invalid pagination')
  }

  let where: Where | undefined
  if (principal.role === 'customer') {
    where = { customer: { equals: principal.id } }
  } else if (principal.role === 'barber') {
    const linked = await payload.find({
      collection: 'barbers', depth: 0, overrideAccess: true, limit: 2,
      where: { user: { equals: principal.id } },
    })
    if (linked.docs.length !== 1) {
      return { docs: [], totalDocs: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false }
    }
    where = { barber: { equals: linked.docs[0].id } }
  } else if (principal.role !== 'admin') {
    throw new BookingManagementError(403, 'Booking history unavailable')
  }

  const result = await payload.find({
    collection: 'bookings', depth: 0, overrideAccess: true,
    page, limit, sort: '-startsAt', ...(where ? { where } : {}),
  })
  // Do not return internal idempotency metadata or customer contact details
  // in list responses. Detail views can implement separately scoped disclosure.
  return {
    docs: result.docs.map(booking => ({
      id: booking.id,
      location: booking.location,
      barber: booking.barber,
      services: booking.services,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      totalPrice: booking.totalPrice,
      status: booking.status,
    })),
    totalDocs: result.totalDocs,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
  }
}
