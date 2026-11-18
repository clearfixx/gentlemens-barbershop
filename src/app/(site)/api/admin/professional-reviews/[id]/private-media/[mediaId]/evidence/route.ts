import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { PortfolioEvidenceConflict, recordPortfolioEvidenceReview } from '@/lib/admin/portfolio-evidence-review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Evidence review is NOT portfolio publication. Browser can only submit
 * a constrained manual decision and opaque references, never photos/identity.
 */
export async function POST(request: Request, { params }: {
  params: Promise<{ id: string; mediaId: string }>
}) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { id, mediaId } = await params
    if (![id, mediaId].every(value => /^[1-9][0-9]*$/.test(value) &&
        Number.isSafeInteger(Number(value)))) {
      return NextResponse.json({ error: 'Invalid identifiers' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Review unavailable' }, { status: 404, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 4 * 1024)
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const recorded = await recordPortfolioEvidenceReview(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), Number(mediaId), body as Parameters<typeof recordPortfolioEvidenceReview>[4])
    return NextResponse.json(recorded, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid evidence references or reviewer explanation' }, {
        status: 422, headers: noStore,
      })
    }
    if (error instanceof PortfolioEvidenceConflict) {
      return NextResponse.json({ error: 'Portfolio submission or reviewer access has changed' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Portfolio evidence review failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Portfolio evidence review unavailable' }, {
      status: 503, headers: noStore,
    })
  }
}
