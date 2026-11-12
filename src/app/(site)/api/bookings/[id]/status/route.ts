import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { BookingManagementError, changeBookingStatus, parseBookingStatus } from '@/lib/booking/manage-booking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'no-store' }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers })
  }
  const budget = checkBookingWriteBudget()
  if (!budget.allowed) {
    return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
      status: 429, headers: { ...headers, 'Retry-After': String(budget.retryAfterSeconds) },
    })
  }
  try {
    const payload = await getPayload({ config })
    // Database failures must never grant an allowance. The outer catch
    // returns 500 and prevents any booking mutation.
    const sharedBudget = await checkSharedBookingWriteBudget(payload)
    if (!sharedBudget.allowed) {
      return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
        status: 429,
        headers: { ...headers, 'Retry-After': String(sharedBudget.retryAfterSeconds) },
      })
    }
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !('role' in user) || typeof user.role !== 'string') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers })
    }
    const principal = { id: Number(user.id), role: user.role }
    const { id } = await context.params
    if (!/^[1-9]\d*$/.test(id)) {
      return NextResponse.json({ error: 'Invalid booking identifier' }, { status: 400, headers })
    }
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers })
    }
    const raw = await request.text()
    if (raw.length > 2048) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413, headers })
    }
    let body: unknown
    try { body = JSON.parse(raw) } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'status' && key !== 'reason')) {
      return NextResponse.json({ error: 'Invalid booking update' }, { status: 400, headers })
    }
    const fields = body as Record<string, unknown>
    const to = parseBookingStatus(fields.status)
    if (fields.reason !== undefined && typeof fields.reason !== 'string') {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400, headers })
    }
    const result = await changeBookingStatus({
      payload, principal, bookingId: Number(id), to,
      reason: fields.reason as string | undefined,
    })
    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof BookingManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode, headers })
    }
    console.error('Booking status update failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking management unavailable' }, { status: 500, headers })
  }
}
