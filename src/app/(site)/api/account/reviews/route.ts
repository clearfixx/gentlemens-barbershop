import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { assertReviewEligibility, isReviewUniquenessError, parseNewReview, ReviewAccessError } from '@/lib/reviews/verified-review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Owners may submit one review of a completed visit; all submissions need moderation. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || user.role !== 'customer') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: noStore })
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: noStore })
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
  }
  try {
    // Enforce the byte budget while reading the stream, even with no Content-Length.
    const input = parseNewReview(await readBookingBody(request, 4096))
    const booking = await payload.findByID({
      collection: 'bookings', id: input.bookingId, depth: 0, overrideAccess: true,
    }).catch(() => null)
    const eligible = assertReviewEligibility(booking, Number(user.id))
    const existing = await payload.find({
      collection: 'reviews', depth: 0, overrideAccess: true,
      where: { booking: { equals: eligible.bookingId } }, limit: 1,
    })
    if (existing.docs.length) {
      return NextResponse.json({ error: 'This visit already has a review' }, { status: 409, headers: noStore })
    }
    const created = await payload.create({
      collection: 'reviews', overrideAccess: true,
      data: {
        booking: eligible.bookingId, customer: Number(user.id), barber: eligible.barberId,
        rating: input.rating, comment: input.comment, status: 'pending',
      },
    })
    return NextResponse.json({ id: created.id, status: 'pending' }, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json(
        { error: error.status === 413 ? 'Review too large' : 'Invalid JSON body' },
        { status: error.status, headers: noStore },
      )
    }
    if (error instanceof ReviewAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (isReviewUniquenessError(error)) {
      return NextResponse.json({ error: 'This visit already has a review' }, { status: 409, headers: noStore })
    }
    console.error('Verified review submission error', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Review unavailable' }, { status: 503, headers: noStore })
  }
}
