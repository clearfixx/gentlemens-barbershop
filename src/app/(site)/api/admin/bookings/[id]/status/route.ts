import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { BookingBodyError } from '@/lib/booking/read-booking-body'
import { readBookingStatusBody } from '@/lib/booking/read-booking-status-body'
import {
  AdminBookingAccessError, AdminBookingConflictError, changeAdminBookingStatus,
} from '@/lib/booking/admin-booking-operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/** Admin staff mutations remain closed in production until booking write rollout. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers })
  }
  const local = checkBookingWriteBudget()
  if (!local.allowed) {
    return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
      status: 429, headers: { ...headers, 'Retry-After': String(local.retryAfterSeconds) },
    })
  }
  try {
    const payload = await getPayload({ config })
    let shared: Awaited<ReturnType<typeof checkSharedBookingWriteBudget>>
    try {
      shared = await checkSharedBookingWriteBudget(payload)
    } catch (error) {
      console.error('Admin booking limiter unavailable', error instanceof Error ? error.name : 'UnknownError')
      return NextResponse.json({ error: 'Booking temporarily unavailable' }, {
        status: 503, headers: { ...headers, 'Retry-After': '60' },
      })
    }
    if (!shared.allowed) {
      return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
        status: 429, headers: { ...headers, 'Retry-After': String(shared.retryAfterSeconds) },
      })
    }
    const { user } = await payload.auth({ headers: request.headers })
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role } : null
    if (!actor || actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new AdminBookingAccessError()
    }
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers: headers })
    }
    const body = await readBookingStatusBody(request)
    const { id } = await context.params
    const updated = await changeAdminBookingStatus(payload, id, body.status, actor)
    return NextResponse.json(updated, { status: 200, headers })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status, headers: headers,
      })
    }
    if (error instanceof AdminBookingAccessError) return NextResponse.json({
      error: 'Administrator authentication required',
    }, { status: 403, headers })
    if (error instanceof AdminBookingConflictError) return NextResponse.json({
      error: 'Booking status cannot be changed',
    }, { status: 409, headers })
    if (error instanceof RangeError) return NextResponse.json({
      error: 'Invalid booking request',
    }, { status: 400, headers })
    console.error('Admin booking update failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 500, headers })
  }
}
