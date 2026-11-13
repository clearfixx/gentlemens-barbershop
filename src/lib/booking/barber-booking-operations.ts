import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { assertBookingStatus, type BookingStatus } from './booking-lifecycle.ts'
import type { BookingActor } from './booking-identity.ts'

export class BarberAccessError extends Error {
  constructor() { super('Barber authentication required'); this.name = 'BarberAccessError' }
}
export class BarberBookingConflictError extends Error {
  constructor() { super('Booking status cannot be changed'); this.name = 'BarberBookingConflictError' }
}

export function authenticatedBarber(actor: BookingActor | null): number {
  if (!actor || actor.role !== 'barber' || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
    throw new BarberAccessError()
  }
  return actor.id
}

export type BarberTargetStatus = 'confirmed' | 'completed' | 'no_show'

export function parseBarberStatusChange(
  bookingId: string,
  target: unknown,
  actor: BookingActor | null,
): { bookingId: number; userId: number; target: BarberTargetStatus; from: 'pending' | 'confirmed' } {
  const userId = authenticatedBarber(actor)
  if (!/^[1-9][0-9]*$/.test(bookingId) || !Number.isSafeInteger(Number(bookingId))) {
    throw new RangeError('Invalid booking identifier')
  }
  if (target !== 'confirmed' && target !== 'completed' && target !== 'no_show') {
    throw new RangeError('Invalid barber booking action')
  }
  return { bookingId: Number(bookingId), userId, target, from: target === 'confirmed' ? 'pending' : 'confirmed' }
}

/**
 * Atomic compare-and-set status change. Barbers are verified by the database
 * association (barbers.user_id), never by the request body or a barber ID.
 * Concurrency with customer cancellation and another staff action is resolved
 * by the WHERE status predicate under PostgreSQL row locking.
 */
export async function changeOwnBarberBookingStatus(
  payload: Pick<Payload, 'db'>,
  bookingId: string,
  target: unknown,
  actor: BookingActor | null,
): Promise<{ id: number; status: BarberTargetStatus }> {
  const { bookingId: id, userId, target: status, from } = parseBarberStatusChange(bookingId, target, actor)
  const result = await payload.db.drizzle.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT booking.id, booking.status AS previous_status
      FROM bookings AS booking
      JOIN barbers AS barber ON barber.id = booking.barber_id
      WHERE booking.id = ${id}
        AND booking.status = ${from}::public.enum_bookings_status
        AND barber.user_id = ${userId}
        AND barber.is_active = TRUE
        AND (
          (${status} = 'confirmed' AND booking.starts_at > NOW())
          OR (${status} = 'completed' AND booking.ends_at <= NOW())
          OR (${status} = 'no_show' AND booking.starts_at <= NOW())
        )
      FOR UPDATE OF booking
    ),
    changed AS (
      UPDATE bookings AS booking
      SET status = ${status}::public.enum_bookings_status, updated_at = NOW()
      FROM eligible
      WHERE booking.id = eligible.id AND booking.status = eligible.previous_status
      RETURNING booking.id, booking.status, eligible.previous_status
    ),
    recorded AS (
      INSERT INTO booking_events
        (booking_id, action, previous_status, actor_id, actor_role, updated_at, created_at)
      SELECT id, ${status}::public.enum_booking_events_action,
        previous_status::text::public.enum_booking_events_previous_status,
        ${userId}, 'assigned_barber'::public.enum_booking_events_actor_role, NOW(), NOW()
      FROM changed
      RETURNING booking_id
    )
    SELECT changed.id, changed.status
    FROM changed JOIN recorded ON recorded.booking_id = changed.id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new Error('Invalid barber booking update response')
  }
  if (result.rows.length !== 1) throw new BarberBookingConflictError()
  const row = result.rows[0] as { id?: unknown; status?: unknown }
  assertBookingStatus(row.status)
  if (Number(row.id) !== id || row.status !== status) throw new Error('Invalid barber booking update identity')
  return { id, status }
}

/** Payload's document ID type may be string or number; expose validated numeric IDs only. */
function numericPayloadId(value: string | number): number {
  if (typeof value === 'string' && !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('Invalid Payload booking identifier')
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Invalid Payload booking identifier')
  }
  return id
}

export type BarberBookingSummary = {
  id: number
  locationId: number
  startsAt: string
  endsAt: string
  status: BookingStatus
  customerName: string
  serviceIds: number[]
}
export type BarberBookingPage = {
  bookings: BarberBookingSummary[]
  page: number
  totalPages: number
  hasNextPage: boolean
}

/** A verified barber's schedule, bounded to one UTC day and their own assignment. */
export async function getOwnBarberBookings(
  payload: Pick<Payload, 'find'>,
  actor: BookingActor | null,
  options: { date: string; page?: number; limit?: number },
): Promise<BarberBookingPage> {
  const userId = authenticatedBarber(actor)
  const { date } = options
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00.000Z')) ||
      new Date(date + 'T00:00:00.000Z').toISOString().slice(0, 10) !== date) {
    throw new RangeError('Invalid UTC booking date')
  }
  const page = options.page ?? 1
  const limit = options.limit ?? 20
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('Invalid barber booking pagination')
  }
  const assigned = await payload.find({
    collection: 'barbers', overrideAccess: true, depth: 0, limit: 2,
    where: { and: [{ user: { equals: userId } }, { isActive: { equals: true } }] },
  })
  if (assigned.docs.length === 0) throw new BarberAccessError()
  if (assigned.docs.length !== 1 || assigned.hasNextPage) throw new Error('Ambiguous barber assignment')
  const barber = assigned.docs[0]
  if (typeof barber.user !== 'number' || barber.user !== userId ||
      !Number.isSafeInteger(numericPayloadId(barber.id))) {
    throw new Error('Invalid barber account assignment')
  }
  const assignedBarberId = numericPayloadId(barber.id)
  const start = date + 'T00:00:00.000Z'
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  const result = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0, limit, page,
    sort: ['startsAt', 'id'],
    where: { and: [
      { barber: { equals: assignedBarberId } },
      { startsAt: { less_than: end } },
      { endsAt: { greater_than: start } },
    ] },
  })
  if (!Array.isArray(result.docs) || result.docs.length > limit ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid barber booking pagination response')
  }
  const bookings: BarberBookingSummary[] = result.docs.map(doc => {
    if (typeof doc.barber !== 'number' || doc.barber !== assignedBarberId) {
      throw new Error('Barber booking ownership mismatch')
    }
    const bookingId = numericPayloadId(doc.id)
    assertBookingStatus(doc.status)
    if (typeof doc.customerName !== 'string' ||
        !Array.isArray(doc.services) || doc.services.length === 0 ||
        typeof doc.location !== 'number' || !Number.isSafeInteger(doc.location) || doc.location <= 0 ||
        typeof doc.startsAt !== 'string' || typeof doc.endsAt !== 'string' ||
        !Number.isFinite(Date.parse(doc.startsAt)) || !Number.isFinite(Date.parse(doc.endsAt))) {
      throw new Error('Invalid barber booking row')
    }
    // Payload relationship arrays may contain expanded objects, even when
    // depth=0 is requested. Never return a populated record to the client.
    const serviceIds = doc.services.map(service => {
      if (typeof service !== 'number' || !Number.isSafeInteger(service) || service <= 0) {
        throw new Error('Invalid barber booking service reference')
      }
      return service
    })
    return {
      id: bookingId,
      locationId: doc.location,
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      status: doc.status,
      customerName: doc.customerName,
      serviceIds,
    }
  })
  return { bookings, page, totalPages: result.totalPages, hasNextPage: result.hasNextPage }
}
