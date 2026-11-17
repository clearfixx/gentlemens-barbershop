import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { preparePrivatePortfolioCandidates, PortfolioCandidateConflict } from '@/lib/admin/private-portfolio-candidates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Creates strictly private candidates, not a public gallery or approval. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { id } = await params
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'Invalid revision identifier' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network admin required' }, { status: 403, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 2048)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).reason !== 'string') {
      return NextResponse.json({ error: 'An administrative reason is required' }, {
        status: 400, headers: noStore,
      })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const result = await preparePrivatePortfolioCandidates(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), (body as { reason: string }).reason)
    return NextResponse.json(result, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid preparation reason' }, { status: 422, headers: noStore })
    }
    if (error instanceof PortfolioCandidateConflict) {
      return NextResponse.json({ error: 'Private portfolio candidate preparation unavailable' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Portfolio candidate preparation failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Portfolio candidate preparation temporarily unavailable' },
      { status: 503, headers: noStore })
  }
}
