import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { withdrawPrivatePortfolioCandidate, PortfolioCandidateConflict } from '@/lib/admin/private-portfolio-candidates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Internal candidate withdrawal; no public photo route exists. */
export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { candidateId } = await params
    if (!/^[1-9][0-9]*$/.test(candidateId) || !Number.isSafeInteger(Number(candidateId))) {
      return NextResponse.json({ error: 'Invalid candidate identifier' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network admin required' }, { status: 403, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 2048)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).reason !== 'string') {
      return NextResponse.json({ error: 'A withdrawal reason is required' }, { status: 400, headers: noStore })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const result = await withdrawPrivatePortfolioCandidate(payload, {
      id: Number(user.id), role: user.role,
    }, Number(candidateId), (body as { reason: string }).reason)
    return NextResponse.json(result, { headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid withdrawal explanation' }, { status: 422, headers: noStore })
    }
    if (error instanceof PortfolioCandidateConflict) {
      return NextResponse.json({ error: 'Candidate unavailable or already withdrawn' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Private candidate withdrawal failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Candidate withdrawal temporarily unavailable' }, {
      status: 503, headers: noStore,
    })
  }
}
