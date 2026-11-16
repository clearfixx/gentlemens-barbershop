import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import type { LocationScope } from './location-access.ts'
import { assertLocationAccess } from './location-access.ts'
import { AdminBookingConflictError } from '../booking/admin-booking-operations.ts'

export type StaffBookingTargetStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled'

export function parseStaffBookingMutation(
  bookingId: string,
  next: unknown,
  scope: LocationScope,
): { bookingId: number; next: StaffBookingTargetStatus } {
  if (!/^[1-9][0-9]*$/.test(bookingId) || !Number.isSafeInteger(Number(bookingId))) {
    throw new RangeError('Invalid booking identifier')
  }
  if (!['confirmed', 'completed', 'no_show', 'cancelled'].includes(String(next)) ||
      typeof next !== 'string') {
    throw new RangeError('Invalid booking transition')
  }
  if (!Number.isSafeInteger(scope.userId) || scope.userId <= 0 ||
      (scope.role !== 'admin' && (scope.role !== 'location_admin' ||
        scope.locationIds.length === 0))) {
    throw new Error('Booking management forbidden')
  }
  return { bookingId: Number(bookingId), next: next as StaffBookingTargetStatus }
}

/** Compare-and-set transition plus append-only audit within a single statement.
 *
 * The location manager's *current* DB assignment is checked again inside SQL,
 * rather than only trusting an earlier UI/API scope snapshot. This avoids
 * unauthorized writes when access was revoked before the mutation.
 */
export async function changeStaffBookingStatus(
  payload: Pick<Payload, 'db'>,
  scope: LocationScope,
  bookingId: string,
  status: unknown,
): Promise<{ id: number; status: StaffBookingTargetStatus }> {
  const parsed = parseStaffBookingMutation(bookingId, status, scope)
  const role = scope.role
  // A manager needs a valid assignment. A network administrator has network scope.
  const allowed = role === 'admin'
    ? sql`TRUE`
    : sql`EXISTS (
        SELECT 1
        FROM location_assignments la
        WHERE la.location_id = booking.location_id
          AND la.user_id = ${scope.userId}
          AND la.is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM users u WHERE u.id = la.user_id
              AND u.role = 'location_admin'::public.enum_users_role
          )
      )`
  const { next } = parsed
  const previous = next === 'confirmed' ? ['pending'] :
    next === 'cancelled' ? ['pending', 'confirmed'] : ['confirmed']
  const result = await payload.db.drizzle.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT booking.id, booking.status AS previous_status
      FROM bookings AS booking
      WHERE booking.id = ${parsed.bookingId}
        AND ${allowed}
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
      UPDATE bookings booking
      SET status = ${next}::public.enum_bookings_status, updated_at = NOW()
      FROM eligible
      WHERE booking.id = eligible.id AND booking.status = eligible.previous_status
      RETURNING booking.id, booking.status, eligible.previous_status
    ),
    recorded AS (
      INSERT INTO booking_events (
        booking_id, action, previous_status, actor_id, actor_role,
        updated_at, created_at
      )
      SELECT id, ${next}::public.enum_booking_events_action,
        previous_status::text::public.enum_booking_events_previous_status,
        ${scope.userId}, ${role}::public.enum_booking_events_actor_role, NOW(), NOW()
      FROM changed
      RETURNING booking_id
    )
    SELECT changed.id, changed.status
    FROM changed INNER JOIN recorded ON changed.id = recorded.booking_id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new Error('Invalid staff booking mutation result')
  }
  if (!result.rows.length) throw new AdminBookingConflictError()
  const row = result.rows[0]
  if (Number(row.id) !== parsed.bookingId || row.status !== next) {
    throw new Error('Invalid staff booking mutation response')
  }
  return { id: parsed.bookingId, status: next }
}

/** Authorize a booking detail request against a current manager assignment.
 * Only used for read-side checks, never as a substitute for mutation SQL scope.
 */
export function assertStaffLocationSelection(scope: LocationScope, locationId: number): void {
  assertLocationAccess(scope, locationId)
}
