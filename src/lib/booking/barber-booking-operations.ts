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
    UPDATE bookings AS booking
    SET status = ${status}, updated_at = NOW()
    WHERE booking.id = ${id}
      AND booking.status = ${from}
      AND EXISTS (
        SELECT 1 FROM barbers AS barber
        WHERE barber.id = booking.barber_id
          AND barber.user_id = ${userId}
          AND barber.is_active = TRUE
      )
      AND (
        (${status} = 'confirmed' AND booking.starts_at > NOW())
        OR (${status} = 'completed' AND booking.ends_at <= NOW())
        OR (${status} = 'no_show' AND booking.starts_at <= NOW())
      )
    RETURNING booking.id, booking.status
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
      !Number.isSafeInteger(barber.id) || barber.id <= 0) {
    throw new Error('Invalid barber account assignment')
  }
  const start = date + 'T00:00:00.000Z'
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  const result = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0, limit, page,
    sort: ['startsAt', 'id'],
    where: { and: [
      { barber: { equals: barber.id } },
      { startsAt: { less_than: end } },
      { endsAt: { greater_than: start } },
    ] },
  })
  if (!Array.isArray(result.docs) || result.docs.length > limit ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid barber booking pagination response')
  }
  const bookings = result.docs.map(doc => {
    if (doc.barber !== barber.id) throw new Error('Barber booking ownership mismatch')
    assertBookingStatus(doc.status)
    if (!Number.isSafeInteger(doc.id) || doc.id <= 0 ||
        typeof doc.customerName !== 'string' ||
        !Array.isArray(doc.services) || !doc.services.every(s => typeof s === 'number' && Number.isSafeInteger(s) && s > 0) ||
        typeof doc.location !== 'number' || !Number.isSafeInteger(doc.location) ||
        typeof doc.startsAt !== 'string' || typeof doc.endsAt !== 'string' ||
        !Number.isFinite(Date.parse(doc.startsAt)) || !Number.isFinite(Date.parse(doc.endsAt))) {
      throw new Error('Invalid barber booking row')
    }
    return {
      id: doc.id,
      locationId: doc.location,
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      status: doc.status,
      customerName: doc.customerName,
      serviceIds: doc.services,
    }
  })
  return { bookings, page, totalPages: result.totalPages, hasNextPage: result.hasNextPage }
}
