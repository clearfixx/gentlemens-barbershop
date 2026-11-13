import type { Payload, Where } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { assertBookingStatus, type BookingStatus } from './booking-lifecycle.ts'
import type { BookingActor } from './booking-identity.ts'

export class AdminBookingAccessError extends Error {
  constructor() { super('Administrator authentication required'); this.name = 'AdminBookingAccessError' }
}
export class AdminBookingConflictError extends Error {
  constructor() { super('Booking status cannot be changed'); this.name = 'AdminBookingConflictError' }
}

function adminUserId(actor: BookingActor | null): number {
  if (!actor || actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
    throw new AdminBookingAccessError()
  }
  return actor.id
}
function safeId(input: unknown): number {
  if (typeof input !== 'number' && (typeof input !== 'string' || !/^[1-9][0-9]*$/.test(input))) {
    throw new RangeError('Invalid booking identifier')
  }
  const id = Number(input)
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError('Invalid booking identifier')
  return id
}
function strictDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value + 'T00:00:00.000Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export type AdminBookingQuery = {
  page?: number
  limit?: number
  locationId?: number
  barberId?: number
  status?: BookingStatus
  date?: string
}
export type AdminBookingItem = {
  id: number
  locationId: number
  barberId: number
  customerId: number | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  serviceIds: number[]
  startsAt: string
  endsAt: string
  totalPrice: number
  status: BookingStatus
}
export type AdminBookingPage = {
  bookings: AdminBookingItem[]
  page: number
  totalPages: number
  hasNextPage: boolean
}

/** Bounded, role-scoped network-wide administrative booking inventory. */
export async function getAdminBookings(
  payload: Pick<Payload, 'find'>,
  actor: BookingActor | null,
  query: AdminBookingQuery = {},
): Promise<AdminBookingPage> {
  adminUserId(actor)
  const page = query.page ?? 1
  const limit = query.limit ?? 20
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('Invalid booking pagination')
  }
  if (query.locationId !== undefined) safeId(query.locationId)
  if (query.barberId !== undefined) safeId(query.barberId)
  if (query.status !== undefined) assertBookingStatus(query.status)
  if (query.date !== undefined && !strictDate(query.date)) throw new RangeError('Invalid booking date')
  const and: Where[] = []
  if (query.locationId) and.push({ location: { equals: query.locationId } })
  if (query.barberId) and.push({ barber: { equals: query.barberId } })
  if (query.status) and.push({ status: { equals: query.status } })
  if (query.date) {
    const start = query.date + 'T00:00:00.000Z'
    const end = new Date(Date.parse(start) + 86_400_000).toISOString()
    and.push({ startsAt: { less_than: end } })
    and.push({ endsAt: { greater_than: start } })
  }
  const result = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0, pagination: true,
    page, limit, sort: ['-startsAt', '-id'],
    ...(and.length > 0 ? { where: { and } } : {}),
  })
  if (!Array.isArray(result.docs) || result.docs.length > limit ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid admin booking pagination response')
  }
  const bookings: AdminBookingItem[] = result.docs.map(doc => {
    assertBookingStatus(doc.status)
    const customerId = doc.customer == null ? null : safeId(doc.customer)
    const services = doc.services
    // Historical/imported or SQL-seeded bookings may have no populated service
    // relationship. Preserve the record in the admin inventory as [] rather
    // than making the whole network view fail.
    if (!Array.isArray(services) ||
        typeof doc.customerName !== 'string' || typeof doc.customerPhone !== 'string' ||
        (doc.customerEmail != null && typeof doc.customerEmail !== 'string') ||
        typeof doc.startsAt !== 'string' || typeof doc.endsAt !== 'string' ||
        !Number.isFinite(Date.parse(doc.startsAt)) || !Number.isFinite(Date.parse(doc.endsAt)) ||
        typeof doc.totalPrice !== 'number' || !Number.isFinite(doc.totalPrice) || doc.totalPrice < 0) {
      throw new Error('Invalid admin booking row')
    }
    return {
      id: safeId(doc.id),
      locationId: safeId(doc.location),
      barberId: safeId(doc.barber),
      customerId,
      customerName: doc.customerName,
      customerPhone: doc.customerPhone,
      customerEmail: doc.customerEmail ?? null,
      serviceIds: services.map(service => safeId(service)),
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      totalPrice: doc.totalPrice,
      status: doc.status,
    }
  })
  return { bookings, page, totalPages: result.totalPages, hasNextPage: result.hasNextPage }
}

export type AdminTargetStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled'
export function parseAdminBookingChange(
  bookingId: string, status: unknown, actor: BookingActor | null,
): { id: number; adminId: number; next: AdminTargetStatus; previous: readonly BookingStatus[] } {
  const adminId = adminUserId(actor)
  const id = safeId(bookingId)
  if (typeof status !== 'string' || !['confirmed', 'completed', 'no_show', 'cancelled'].includes(status)) {
    throw new RangeError('Invalid administrative status action')
  }
  const next = status as AdminTargetStatus
  return {
    id, adminId, next,
    previous: next === 'confirmed' ? ['pending']
      : next === 'cancelled' ? ['pending', 'confirmed'] : ['confirmed'],
  }
}

/** One compare-and-set mutation plus append-only audit event, all-or-nothing. */
export async function changeAdminBookingStatus(
  payload: Pick<Payload, 'db'>,
  bookingId: string,
  status: unknown,
  actor: BookingActor | null,
): Promise<{ id: number; status: AdminTargetStatus }> {
  const { id, adminId, next, previous } = parseAdminBookingChange(bookingId, status, actor)
  const result = await payload.db.drizzle.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT booking.id, booking.status AS previous_status
      FROM bookings AS booking
      WHERE booking.id = ${id}
        AND booking.status = ANY(
          ARRAY[${previous[0]}::public.enum_bookings_status,
            ${previous.length === 2 ? previous[1] : previous[0]}::public.enum_bookings_status]
        )
        AND (
          (${next} = 'confirmed' AND booking.starts_at > NOW())
          OR (${next} = 'completed' AND booking.ends_at <= NOW())
          OR (${next} = 'no_show' AND booking.starts_at <= NOW())
          OR (${next} = 'cancelled')
        )
      FOR UPDATE OF booking
    ),
    changed AS (
      UPDATE bookings AS booking
      SET status = ${next}::public.enum_bookings_status, updated_at = NOW()
      FROM eligible
      WHERE booking.id = eligible.id AND booking.status = eligible.previous_status
      RETURNING booking.id, booking.status, eligible.previous_status
    ),
    recorded AS (
      INSERT INTO booking_events
        (booking_id, action, previous_status, actor_id, actor_role, updated_at, created_at)
      SELECT id, ${next}::public.enum_booking_events_action,
        previous_status::text::public.enum_booking_events_previous_status,
        ${adminId}, 'admin'::public.enum_booking_events_actor_role, NOW(), NOW()
      FROM changed RETURNING booking_id
    )
    SELECT changed.id, changed.status
    FROM changed JOIN recorded ON recorded.booking_id = changed.id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) throw new Error('Invalid admin booking response')
  if (!result.rows.length) throw new AdminBookingConflictError()
  const row = result.rows[0]
  if (safeId(row.id) !== id || row.status !== next) throw new Error('Invalid admin booking update result')
  return { id, status: next }
}
