import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { relationshipId, resolveBookingActor, type BookingPrincipal } from './booking-access.ts'
import { decideBookingTransition, type BookingStatus } from './booking-status-policy.ts'
import { canCustomerCancelBooking, resolveCancellationDeadlineMinutes } from './cancellation-policy.ts'

export class BookingManagementError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'BookingManagementError'
    this.statusCode = statusCode
  }
}

const statuses = new Set<BookingStatus>(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])

export function parseBookingStatus(value: unknown): BookingStatus {
  if (typeof value !== 'string' || !statuses.has(value as BookingStatus)) {
    throw new BookingManagementError(400, 'Invalid booking status')
  }
  return value as BookingStatus
}

type BookingRow = {
  id: number
  status: BookingStatus
  customer_id: number | null
  barber_id: number
  location_id: number
  starts_at: Date
  barber_user_id: number | null
  cancellation_deadline_minutes: number | null
}

/**
 * One PostgreSQL transaction protects the row lock, current-location policy,
 * state transition and immutable audit event. Never trust actor IDs from HTTP.
 */
export async function changeBookingStatus(input: {
  payload: Payload
  principal: BookingPrincipal
  bookingId: number
  to: BookingStatus
  reason?: string
  now?: Date
}) {
  const { payload, principal, bookingId, to } = input
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    throw new BookingManagementError(400, 'Invalid booking identifier')
  }
  if (!Number.isSafeInteger(principal.id) || principal.id <= 0) {
    throw new BookingManagementError(401, 'Authentication required')
  }
  if (input.reason !== undefined &&
    (typeof input.reason !== 'string' || input.reason.length > 1000)) {
    throw new BookingManagementError(400, 'Invalid reason')
  }

  const db = payload.db.drizzle
  return db.transaction(async tx => {
    const result = await tx.execute(sql`
      SELECT b.id, b.status, b.customer_id, b.barber_id, b.location_id, b.starts_at,
             bar.user_id AS barber_user_id,
             loc.cancellation_deadline_minutes
      FROM bookings b
      JOIN barbers bar ON bar.id = b.barber_id
      JOIN locations loc ON loc.id = b.location_id
      WHERE b.id = ${bookingId}
      FOR UPDATE OF b
    `)
    const row = result.rows[0] as BookingRow | undefined
    if (!row) throw new BookingManagementError(404, 'Booking not found')

    const actor = resolveBookingActor({
      principal,
      bookingCustomerId: relationshipId(row.customer_id),
      assignedBarberUserId: relationshipId(row.barber_user_id),
    })
    // Do not reveal existence of someone else's booking.
    if (!actor) throw new BookingManagementError(404, 'Booking not found')
    const now = input.now ?? new Date()
    const deadlineMinutes = resolveCancellationDeadlineMinutes(
      row.cancellation_deadline_minutes == null
        ? null
        : Number(row.cancellation_deadline_minutes),
    )
    const decision = decideBookingTransition({
      actor, from: row.status, to, startsAt: row.starts_at, now,
      customerCancellationAllowed: canCustomerCancelBooking({
        startsAt: row.starts_at, now, deadlineMinutes,
      }),
    })
    if (!decision.allowed) {
      throw new BookingManagementError(
        decision.reason === 'forbidden' ? 403 : 409,
        'Booking status transition unavailable',
      )
    }

    await tx.execute(sql`
      UPDATE bookings
      SET status = ${to}::"enum_bookings_status", updated_at = now()
      WHERE id = ${bookingId}
    `)
    await tx.execute(sql`
      INSERT INTO booking_events
        (booking_id, action, previous_status, actor_id, actor_role, reason, created_at, updated_at)
      VALUES (
        ${bookingId}, ${to}::"enum_booking_events_action",
        ${row.status}::"enum_booking_events_previous_status",
        ${principal.id}, ${actor}::"enum_booking_events_actor_role",
        ${input.reason?.trim() || null}, now(), now()
      )
    `)
    return { id: bookingId, previousStatus: row.status, status: to }
  })
}
