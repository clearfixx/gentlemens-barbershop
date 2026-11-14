import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { BookingBodyError } from '@/lib/booking/read-booking-body'
import { readBookingStatusBody } from '@/lib/booking/read-booking-status-body'
import {
  BarberAccessError, BarberBookingConflictError, changeOwnBarberBookingStatus,
} from '@/lib/booking/barber-booking-operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'Cache-Control': 'no-store' }

/**
 * Staff status mutations are disabled in production until the same booking
 * deployment preflight is approved as for customer booking writes.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers: noStore })
  }
  const workerBudget = checkBookingWriteBudget()
  if (!workerBudget.allowed) return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
    status: 429, headers: { ...noStore, 'Retry-After': String(workerBudget.retryAfterSeconds) },
  })
  try {
    const payload = await getPayload({ config })
    let shared: Awaited<ReturnType<typeof checkSharedBookingWriteBudget>>
    try {
      shared = await checkSharedBookingWriteBudget(payload)
    } catch (error) {
      console.error('Barber booking limiter unavailable', error instanceof Error ? error.name : 'UnknownError')
      return NextResponse.json({ error: 'Booking temporarily unavailable' }, {
        status: 503, headers: { ...noStore, 'Retry-After': '60' },
      })
    }
    if (!shared.allowed) return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
      status: 429, headers: { ...noStore, 'Retry-After': String(shared.retryAfterSeconds) },
    })
    const auth = await payload.auth({ headers: request.headers })
    const user = auth.user
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role } : null
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers: noStore })
    }
    const body = await readBookingStatusBody(request)
    const { id } = await context.params
    const outcome = await changeOwnBarberBookingStatus(payload, id, body.status, actor)
    return NextResponse.json(outcome, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status, headers: noStore,
      })
    }
    if (error instanceof BarberAccessError) return NextResponse.json({
      error: 'Barber authentication required',
    }, { status: 403, headers: noStore })
    if (error instanceof BarberBookingConflictError) return NextResponse.json({
      error: 'Booking status cannot be changed',
    }, { status: 409, headers: noStore })
    if (error instanceof RangeError) return NextResponse.json({
      error: 'Invalid barber booking request',
    }, { status: 400, headers: noStore })
    console.error('Barber status update failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 500, headers: noStore })
  }
}
