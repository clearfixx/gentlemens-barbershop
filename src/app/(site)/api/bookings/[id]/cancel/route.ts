import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingHttpError } from '@/lib/booking/booking-http'
import { bookingWritesEnabled, checkBookingWriteBudget, checkSharedBookingWriteBudget } from '@/lib/booking/booking-write-guard'
import { cancelOwnedBooking, BookingCancellationConflictError } from '@/lib/booking/cancel-owned-booking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'no-store' }

/** Customer-only cancellation; write permissions are intentionally unavailable in production. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!bookingWritesEnabled(process.env)) {
    return NextResponse.json({ error: 'Booking writes unavailable' }, { status: 503, headers: noStore })
  }
  const localBudget = checkBookingWriteBudget()
  if (!localBudget.allowed) {
    return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
      status: 429, headers: { ...noStore, 'Retry-After': String(localBudget.retryAfterSeconds) },
    })
  }
  try {
    const payload = await getPayload({ config })
    let shared: Awaited<ReturnType<typeof checkSharedBookingWriteBudget>>
    try {
      shared = await checkSharedBookingWriteBudget(payload)
    } catch (error) {
      console.error('Booking cancellation limiter unavailable', error instanceof Error ? error.name : 'UnknownError')
      return NextResponse.json({ error: 'Booking temporarily unavailable' }, {
        status: 503, headers: { ...noStore, 'Retry-After': '60' },
      })
    }
    if (!shared.allowed) {
      return NextResponse.json({ error: 'Booking requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(shared.retryAfterSeconds) },
      })
    }
    const authentication = await payload.auth({ headers: request.headers })
    const user = authentication.user
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role }
      : null
    const { id } = await context.params
    const cancelled = await cancelOwnedBooking(payload, id, actor)
    return NextResponse.json(cancelled, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookingCancellationConflictError) {
      // Intentionally hide whether the booking exists or belongs to another user.
      return NextResponse.json({ error: 'Booking cannot be cancelled' }, { status: 409, headers: noStore })
    }
    const known = bookingHttpError(error)
    if (known) return NextResponse.json({ error: known.message }, { status: known.status, headers: noStore })
    console.error('Booking cancellation failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking unavailable' }, { status: 500, headers: noStore })
  }
}
