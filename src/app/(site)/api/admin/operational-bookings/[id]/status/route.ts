import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingWritesEnabled } from '@/lib/booking/booking-write-guard'
import { BookingBodyError } from '@/lib/booking/read-booking-body'
import { readBookingStatusBody } from '@/lib/booking/read-booking-status-body'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { changeStaffBookingStatus } from '@/lib/admin/staff-booking-transitions'
import { AdminBookingConflictError } from '@/lib/booking/admin-booking-operations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** Production booking writes stay blocked until the existing rollout gate is
 * deliberately reviewed; adding this route does not silently enable them.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers })
  }
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || (user.role !== 'admin' && user.role !== 'location_admin')) {
      return NextResponse.json({ error: 'Staff authentication required' }, { status: 403, headers })
    }
    const scope = await resolveLocationScope(payload, {
      id: Number(user.id), role: user.role,
    })
    const { id } = await context.params
    const body = await readBookingStatusBody(request)
    const budget = await checkCommercialWriteBudget(payload, scope.userId)
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...headers, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const result = await changeStaffBookingStatus(payload, scope, id, body.status)
    return NextResponse.json(result, { headers })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof AdminBookingConflictError) {
      return NextResponse.json({ error: 'Booking transition conflict or inaccessible booking' }, {
        status: 409, headers,
      })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid booking request' }, { status: 400, headers })
    }
    if (error instanceof Error && /origin|forbidden|authentication|assigned locations/i.test(error.message)) {
      return NextResponse.json({ error: 'Booking management forbidden' }, { status: 403, headers })
    }
    console.error('Staff booking transition failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking management unavailable' }, { status: 503, headers })
  }
}
