import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { BookingBodyError, readBookingBody } from '@/lib/booking/read-booking-body'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import {
  confirmGuestCancellation, guestCancellationDeliveryConfigured,
  GuestCancellationConflictError, parseGuestCancellationConfirmation,
} from '@/lib/booking/guest-cancellation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/** A booking number alone cannot authorize a cancellation. */
export async function POST(request: Request) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers })
  }
  if (!guestCancellationDeliveryConfigured(process.env)) {
    return NextResponse.json({ error: 'Cancellation verification unavailable' }, { status: 503, headers })
  }
  const local = checkBookingWriteBudget()
  if (!local.allowed) return NextResponse.json({ error: 'Request limited' }, {
    status: 429, headers: { ...headers, 'Retry-After': String(local.retryAfterSeconds) },
  })
  try {
    const payload = await getPayload({ config })
    const shared = await checkSharedBookingWriteBudget(payload)
    if (!shared.allowed) return NextResponse.json({ error: 'Request limited' }, {
      status: 429, headers: { ...headers, 'Retry-After': String(shared.retryAfterSeconds) },
    })
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers })
    }
    const body = parseGuestCancellationConfirmation(await readBookingBody(request, 256))
    const result = await confirmGuestCancellation({
      payload, ...body, secret: process.env.PAYLOAD_SECRET!,
    })
    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: error.status, headers })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
    }
    if (error instanceof GuestCancellationConflictError) {
      return NextResponse.json({ error: 'Cancellation cannot be verified' }, { status: 409, headers })
    }
    console.error('Guest cancellation confirmation failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Cancellation unavailable' }, { status: 503, headers })
  }
}
