import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { rejectProfessionalProposal } from '@/lib/admin/reject-professional-proposal'
import { ProfessionalReviewConflictError } from '@/lib/admin/professional-approval-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers: noStore })
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid rejection request' }, { status: 400, headers: noStore })
    }
    const input = body as Record<string, unknown>
    if (Object.keys(input).length !== 1 || typeof input.reason !== 'string') {
      return NextResponse.json({ error: 'Invalid rejection request' }, { status: 400, headers: noStore })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429,
        headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const outcome = await rejectProfessionalProposal(payload, Number(id),
      { id: Number(user.id), role: 'admin' }, input.reason)
    return NextResponse.json(outcome, { headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'A rejection reason is required (maximum 1000 characters)' }, {
        status: 400, headers: noStore,
      })
    }
    if (error instanceof ProfessionalReviewConflictError) {
      return NextResponse.json({ error: 'Review changed; refresh the page' }, {
        status: 409, headers: noStore,
      })
    }
    if (error instanceof Error && /origin|forbidden|self-approval/.test(error.message)) {
      return NextResponse.json({ error: 'Professional review forbidden' }, { status: 403, headers: noStore })
    }
    console.error('Professional rejection failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Professional review unavailable' }, { status: 503, headers: noStore })
  }
}
