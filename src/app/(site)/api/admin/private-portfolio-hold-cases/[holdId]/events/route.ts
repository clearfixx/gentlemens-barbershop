import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { HoldCaseConflict, recordPortfolioHoldCaseEvent } from '@/lib/admin/portfolio-hold-cases'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Internal case notes only, never claimant verification or removal of a hold. */
export async function POST(request: Request, { params }: { params: Promise<{ holdId: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { holdId } = await params
    if (!/^[1-9][0-9]*$/.test(holdId) || !Number.isSafeInteger(Number(holdId))) {
      return NextResponse.json({ error: 'Invalid case ID' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network administrator required' }, { status: 403, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 2048)
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const recorded = await recordPortfolioHoldCaseEvent(payload, {
      id: Number(user.id), role: user.role,
    }, Number(holdId), body)
    return NextResponse.json(recorded, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid case stage, assigned administrator or explanation' }, {
        status: 422, headers: noStore,
      })
    }
    if (error instanceof HoldCaseConflict) {
      return NextResponse.json({ error: 'Case unavailable, already closed or assignment changed' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Private portfolio case review unavailable', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Case review temporarily unavailable' }, {
      status: 503, headers: noStore,
    })
  }
}
