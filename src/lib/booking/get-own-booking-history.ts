import type { Payload, Where } from 'payload'
import { bookingIdentityScope, type BookingActor } from './booking-identity.ts'
import { assertBookingStatus, type BookingStatus } from './booking-lifecycle.ts'

export const MAX_BOOKING_HISTORY_PAGE_SIZE = 50
export type BookingHistoryFilter = 'all' | 'upcoming' | 'past'

export type OwnBookingHistoryItem = {
  id: number
  locationId: number
  barberId: number
  serviceIds: number[]
  startsAt: string
  endsAt: string
  totalPrice: number
  status: BookingStatus
}

export type OwnBookingHistoryPage = {
  bookings: OwnBookingHistoryItem[]
  page: number
  totalPages: number
  hasNextPage: boolean
}

function positiveId(value: unknown): number {
  const id = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid booking relation identifier')
  return id
}

function dateTime(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid booking timestamp')
  }
  const date = new Date(value).toISOString()
  if (value !== date && value !== date.replace('.000Z', 'Z')) {
    throw new Error('Invalid booking timestamp')
  }
  return date
}

function ownBookingRow(value: unknown, ownerId: number): OwnBookingHistoryItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid booking history row')
  }
  const row = value as Record<string, unknown>
  // OverrideAccess is used only for the server-side read, never as a substitute
  // for row ownership checks; refuse suspicious adapter results.
  if (positiveId(row.customer) !== ownerId) throw new Error('Booking history ownership mismatch')
  if (!Array.isArray(row.services) || row.services.length === 0 ||
      row.services.length > 10) throw new Error('Invalid booking services')
  assertBookingStatus(row.status)
  if (typeof row.totalPrice !== 'number' ||
      !Number.isSafeInteger(row.totalPrice) || row.totalPrice < 0) {
    throw new Error('Invalid booking price')
  }
  const startsAt = dateTime(row.startsAt)
  const endsAt = dateTime(row.endsAt)
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('Invalid booking interval')
  return {
    id: positiveId(row.id),
    locationId: positiveId(row.location),
    barberId: positiveId(row.barber),
    serviceIds: row.services.map(positiveId),
    startsAt, endsAt,
    totalPrice: row.totalPrice,
    status: row.status,
  }
}

/**
 * Bounded, ownership-scoped booking history. Never accept a customer ID from
 * the request; selected output intentionally excludes contact details, notes,
 * and idempotency metadata even when the internal query has privileged access.
 */
export async function getOwnBookingHistory(
  payload: Pick<Payload, 'find'>,
  actor: BookingActor | null,
  options: { page?: number; limit?: number; filter?: BookingHistoryFilter; now?: Date; activeOnly?: boolean; ascending?: boolean } = {},
): Promise<OwnBookingHistoryPage> {
  bookingIdentityScope(actor)
  const customerId = actor!.id
  const page = options.page ?? 1
  const limit = options.limit ?? 20
  const filter = options.filter ?? 'all'
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
    throw new RangeError('Invalid booking history page')
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BOOKING_HISTORY_PAGE_SIZE) {
    throw new RangeError('Invalid booking history page size')
  }
  if (!['all', 'upcoming', 'past'].includes(filter)) {
    throw new RangeError('Invalid booking history filter')
  }
  if (options.activeOnly !== undefined && typeof options.activeOnly !== 'boolean') throw new RangeError('Invalid status filter')
  if (options.ascending !== undefined && typeof options.ascending !== 'boolean') throw new RangeError('Invalid sort direction')
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid booking history clock')
  const and: Where[] = [{ customer: { equals: customerId } }]
  if (options.activeOnly) and.push({ status: { in: ['pending', 'confirmed'] } })
  if (filter === 'upcoming') and.push({ startsAt: { greater_than_equal: now.toISOString() } })
  if (filter === 'past') and.push({ startsAt: { less_than: now.toISOString() } })
  const result = await payload.find({
    collection: 'bookings',
    overrideAccess: true,
    depth: 0,
    page,
    limit,
    pagination: true,
    sort: options.ascending ? ['startsAt', 'id'] : ['-startsAt', '-id'],
    where: { and },
  })
  if (!Array.isArray(result.docs) || result.docs.length > limit ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid booking history pagination response')
  }
  return {
    bookings: result.docs.map(doc => ownBookingRow(doc, customerId)),
    page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  }
}
