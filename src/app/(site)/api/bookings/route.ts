import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingHttpError } from '@/lib/booking/booking-http'
import { BookingBodyError, readBookingBody } from '@/lib/booking/read-booking-body'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { submitBooking } from '@/lib/booking/submit-booking'
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
    // A limiter outage must fail closed as a service outage, not as a
    // generic booking error. No authentication or mutation runs on failure.
    let sharedBudget: Awaited<ReturnType<typeof checkSharedBookingWriteBudget>>
    try {
      sharedBudget = await checkSharedBookingWriteBudget(payload)
    } catch (error) {
      console.error('Booking rate limiter unavailable', error instanceof Error ? error.name : 'UnknownError')
      return NextResponse.json({ error: 'Booking temporarily unavailable' }, {
        status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
      })
    }
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
    const body = await readBookingBody(request)

    const result = await submitBooking({
      body,
      idempotencyKey: request.headers.get('idempotency-key'),
      actor,
      allowed: true,
      guestSecret: process.env.PAYLOAD_SECRET,
      create: (input, scope, key) => createIdempotentPayloadBooking(payload, input, scope, key),
    })
    return NextResponse.json({
      id: result.booking.id,
      replayed: result.replayed,
    }, { status: result.replayed ? 200 : 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    const known = bookingHttpError(error)
    if (known) return NextResponse.json({ error: known.message }, { status: known.status, headers: noStore })
    console.error('Booking write failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 500, headers: noStore })
  }
}
