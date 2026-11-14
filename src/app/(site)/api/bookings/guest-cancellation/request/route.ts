import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { BookingBodyError, readBookingBody } from '@/lib/booking/read-booking-body'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import {
  deliverGuestCancellationCode, guestCancellationDeliveryConfigured,
  parseGuestCancellationRequest, requestGuestCancellation,
} from '@/lib/booking/guest-cancellation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store' }

/** Non-enumerating guest cancellation code request. */
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
    const { bookingId, email } = parseGuestCancellationRequest(await readBookingBody(request, 512))
    await requestGuestCancellation({
      payload, bookingId, email, secret: process.env.PAYLOAD_SECRET!,
      deliver: (to, code) => deliverGuestCancellationCode({
        email: to, code, apiKey: process.env.RESEND_API_KEY!, from: process.env.RESEND_FROM_EMAIL!,
      }),
    })
    // Same result for an invalid ID, unknown email, inactive booking or cooldown.
    return NextResponse.json({ accepted: true }, { status: 202, headers })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: error.status, headers })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
    }
    console.error('Guest cancellation request unavailable', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Cancellation verification unavailable' }, { status: 503, headers })
  }
}
