import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingHttpError } from '@/lib/booking/booking-http'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { submitAuthenticatedBooking } from '@/lib/booking/submit-authenticated-booking'
import { createIdempotentPayloadBooking } from '@/lib/booking/payload-booking-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'no-store' }

/**
 * Disabled in production until a shared rate limit and deployment migration
 * preflight are enforced. Never use caller-supplied identity headers.
 */
export async function POST(request: Request) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers: noStore })
  }
  const budget = checkBookingWriteBudget()
  if (!budget.allowed) {
    return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
      status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
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
        headers: { ...noStore, 'Retry-After': String(sharedBudget.retryAfterSeconds) },
      })
    }
    const authentication = await payload.auth({ headers: request.headers })
    const user = authentication.user
    const actor = user && 'role' in user && 'email' in user &&
      typeof user.role === 'string' && typeof user.email === 'string'
      ? { id: Number(user.id), role: user.role, email: user.email }
      : null

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers: noStore })
    }
    const raw = await request.text()
    if (raw.length > 8192) {
      return NextResponse.json({ error: 'Booking body too large' }, { status: 413, headers: noStore })
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: noStore })
    }

    const result = await submitAuthenticatedBooking({
      body,
      idempotencyKey: request.headers.get('idempotency-key'),
      actor,
      allowed: true,
      create: (input, scope, key) => createIdempotentPayloadBooking(payload, input, scope, key),
    })
    return NextResponse.json({
      id: result.booking.id,
      replayed: result.replayed,
    }, { status: result.replayed ? 200 : 201, headers: noStore })
  } catch (error) {
    const known = bookingHttpError(error)
    if (known) return NextResponse.json({ error: known.message }, { status: known.status, headers: noStore })
    console.error('Booking write failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 500, headers: noStore })
  }
}
