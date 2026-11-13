import type { Payload } from 'payload'
import type { BookingActor } from './booking-identity.ts'
import { assertBookingStatus, type BookingStatus } from './booking-lifecycle.ts'

export class AdminBookingAuditAccessError extends Error {
  constructor() {
    super('Administrator authentication required')
    this.name = 'AdminBookingAuditAccessError'
  }
}

export type BookingAuditEvent = {
  id: number
  bookingId: number
  action: Exclude<BookingStatus, 'pending'>
  previousStatus: BookingStatus
  actorId: number
  actorRole: 'customer' | 'assigned_barber' | 'admin'
  reason: string | null
  createdAt: string
}
export type BookingAuditPage = {
  events: BookingAuditEvent[]
  page: number
  totalPages: number
  hasNextPage: boolean
}

function idOf(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))) {
    throw new RangeError('Invalid audit identifier')
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError('Invalid audit identifier')
  return result
}

function eventOf(value: unknown, bookingId: number): BookingAuditEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid booking audit row')
  }
  const item = value as Record<string, unknown>
  if (idOf(item.booking) !== bookingId) throw new Error('Booking audit scope mismatch')
  assertBookingStatus(item.action)
  assertBookingStatus(item.previousStatus)
  if (item.action === 'pending' ||
      (item.actorRole !== 'customer' && item.actorRole !== 'assigned_barber' && item.actorRole !== 'admin') ||
      typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
      (item.reason != null && typeof item.reason !== 'string')) {
    throw new Error('Invalid booking audit row')
  }
  return {
    id: idOf(item.id),
    bookingId,
    action: item.action,
    previousStatus: item.previousStatus,
    actorId: idOf(item.actor),
    actorRole: item.actorRole,
    reason: item.reason ?? null,
    createdAt: new Date(item.createdAt).toISOString(),
  }
}

/** Read-only, bounded timeline for one booking; never accept actor identity from query. */
export async function getAdminBookingAudit(
  payload: Pick<Payload, 'find'>,
  actor: BookingActor | null,
  bookingId: string,
  options: { page?: number; limit?: number } = {},
): Promise<BookingAuditPage> {
  if (!actor || actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
    throw new AdminBookingAuditAccessError()
  }
  const id = idOf(bookingId)
  const page = options.page ?? 1
  const limit = options.limit ?? 20
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('Invalid booking audit pagination')
  }
  const result = await payload.find({
    collection: 'booking-events',
    overrideAccess: true,
    depth: 0,
    pagination: true,
    page,
    limit,
    sort: ['createdAt', 'id'],
    where: { booking: { equals: id } },
  })
  if (!Array.isArray(result.docs) || result.docs.length > limit ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid booking audit pagination response')
  }
  return {
    events: result.docs.map(row => eventOf(row, id)),
    page,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  }
}
