import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { signoffPortfolioReview, PortfolioSignoffConflict } from '@/lib/admin/portfolio-review-signoff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Documentation signoff ONLY. Never changes published profile or public media. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network administrator required' }, { status: 403, headers: noStore })
    }
    const { id } = await context.params
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'Invalid review ID' }, { status: 400, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 2048)
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const recorded = await signoffPortfolioReview(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), body)
    return NextResponse.json(recorded, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid portfolio signoff request' },
        { status: 422, headers: noStore })
    }
    if (error instanceof PortfolioSignoffConflict) {
      return NextResponse.json({ error: 'Review changed or evidence is incomplete. Refresh.' },
        { status: 409, headers: noStore })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Portfolio documentation signoff failed',
      error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Portfolio review temporarily unavailable' },
      { status: 503, headers: noStore })
  }
}
