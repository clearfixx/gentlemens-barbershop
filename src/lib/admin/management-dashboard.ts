import type { Payload, Where } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { assertLocationAccess, type LocationScope } from './location-access.ts'

/** A requested branch is a filter, never a permission grant. */
export function resolveDashboardLocations(
  scope: LocationScope,
  requestedLocation: string | undefined,
): number[] | null {
  if (requestedLocation !== undefined) {
    if (!/^[1-9][0-9]*$/.test(requestedLocation) ||
        !Number.isSafeInteger(Number(requestedLocation))) {
      throw new RangeError('Invalid dashboard location')
    }
    const id = Number(requestedLocation)
    assertLocationAccess(scope, id)
    return [id]
  }
  return scope.role === 'admin' ? null : [...scope.locationIds]
}

function metric(value: unknown): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new Error('Invalid dashboard metric')
  }
  return n
}
export type DashboardData = {
  metrics: {
    bookingsToday: number
    awaitingConfirmation: number
    completedToday: number
    revenueTodayUAH: number
    pendingApprovals: number
    pendingReviews: number
  }
  recentBookings: Array<{
    id: number; customerName: string; startsAt: string
    status: string; price: number; locationId: number
  }>
}

/** Scope ALL queries at the database boundary. Kyiv dates use PostgreSQL
 * timezone conversion; this handles daylight-saving transitions correctly.
 */
export async function loadManagementDashboard(
  payload: Pick<Payload, 'db' | 'find'>,
  locationIds: number[] | null,
): Promise<DashboardData> {
  if (locationIds !== null &&
      (!locationIds.length || locationIds.some(id => !Number.isSafeInteger(id) || id <= 0))) {
    throw new Error('Dashboard requires assigned locations')
  }
  const scoped = locationIds !== null
  const locationsFilter = scoped
    ? sql`AND location_id IN (${sql.join(locationIds!.map(id => sql`${id}`), sql`, `)})`
    : sql``
  const reviewsFilter = scoped
    ? sql`AND b.location_id IN (${sql.join(locationIds!.map(id => sql`${id}`), sql`, `)})`
    : sql``
  const [bookings, requests, reviews, recent] = await Promise.all([
    payload.db.drizzle.execute(sql`
      SELECT
        count(*) FILTER (WHERE (starts_at AT TIME ZONE 'Europe/Kyiv')::date =
          (now() AT TIME ZONE 'Europe/Kyiv')::date)::int AS today,
        count(*) FILTER (WHERE status = 'pending'::public.enum_bookings_status)::int AS pending,
        count(*) FILTER (WHERE status = 'completed'::public.enum_bookings_status
          AND (ends_at AT TIME ZONE 'Europe/Kyiv')::date =
          (now() AT TIME ZONE 'Europe/Kyiv')::date)::int AS completed,
        coalesce(sum(total_price) FILTER
          (WHERE status = 'completed'::public.enum_bookings_status
          AND (ends_at AT TIME ZONE 'Europe/Kyiv')::date =
          (now() AT TIME ZONE 'Europe/Kyiv')::date), 0)::bigint AS revenue
      FROM bookings WHERE TRUE ${locationsFilter}
    `),
    payload.db.drizzle.execute(sql`
      SELECT count(*)::int AS total FROM commercial_change_requests
      WHERE status = 'pending'::public.enum_commercial_change_requests_status ${locationsFilter}
    `),
    payload.db.drizzle.execute(sql`
      SELECT count(*)::int AS total FROM reviews r
      JOIN bookings b ON b.id = r.booking_id
      WHERE r.status = 'pending'::public.enum_reviews_status ${reviewsFilter}
    `),
    payload.find({
      collection: 'bookings', overrideAccess: true, depth: 0, limit: 8, sort: '-createdAt',
      ...(scoped ? { where: { location: { in: locationIds } } as Where } : {}),
    }),
  ])
  if (bookings.rows.length !== 1 || requests.rows.length !== 1 || reviews.rows.length !== 1) {
    throw new Error('Invalid management metrics')
  }
  return {
    metrics: {
      bookingsToday: metric(bookings.rows[0].today),
      awaitingConfirmation: metric(bookings.rows[0].pending),
      completedToday: metric(bookings.rows[0].completed),
      revenueTodayUAH: metric(bookings.rows[0].revenue),
      pendingApprovals: metric(requests.rows[0].total),
      pendingReviews: metric(reviews.rows[0].total),
    },
    recentBookings: recent.docs.map(item => ({
      id: Number(item.id), customerName: item.customerName, startsAt: item.startsAt,
      status: item.status, price: item.totalPrice,
      locationId: typeof item.location === 'number' ? item.location : Number(item.location.id),
    })),
  }
}
