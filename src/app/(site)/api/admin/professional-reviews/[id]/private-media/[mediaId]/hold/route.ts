import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { placePrecautionaryPortfolioHold, PortfolioHoldConflict } from '@/lib/admin/portfolio-precautionary-holds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Admin-only precautionary lock, never a verified claimant or consent decision. */
export async function POST(request: Request, { params }: {
  params: Promise<{ id: string; mediaId: string }>
}) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { id, mediaId } = await params
    if (![id, mediaId].every(v => /^[1-9][0-9]*$/.test(v) && Number.isSafeInteger(Number(v)))) {
      return NextResponse.json({ error: 'Invalid identifiers' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network admin required' }, { status: 403, headers: noStore })
    }
    const input: unknown = await readBookingBody(request, 2048)
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const result = await placePrecautionaryPortfolioHold(payload,
      { id: Number(user.id), role: user.role }, Number(id), Number(mediaId), input)
    return NextResponse.json(result, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid concern type, case or explanation' }, {
        status: 422, headers: noStore,
      })
    }
    if (error instanceof PortfolioHoldConflict) {
      return NextResponse.json({ error: 'Material unavailable or already held' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Private portfolio hold error', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Precautionary hold unavailable' }, { status: 503, headers: noStore })
  }
}
