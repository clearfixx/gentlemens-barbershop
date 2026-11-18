import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { assertCommercialMutationOrigin, parseTariffDecision } from '@/lib/admin/commercial-http'
import { decideBarberTariffProposal } from '@/lib/admin/decide-barber-tariff-proposal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !('role' in user) || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network administrator required' }, { status: 403, headers })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...headers, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const { id } = await context.params
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'Invalid proposal ID' }, { status: 400, headers })
    }
    const decision = parseTariffDecision(await readBookingBody(request, 2048))
    const result = await decideBarberTariffProposal(payload, Number(id),
      { id: Number(user.id), role: 'admin' }, decision)
    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid commercial decision' }, { status: 400, headers })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
    }
    if (error instanceof Error && /stale|no longer pending|conflict|Self approval|Missing or ambiguous/.test(error.message)) {
      return NextResponse.json({ error: 'Proposal cannot be applied; refresh the request' }, { status: 409, headers })
    }
    if (error instanceof Error && /forbidden|restricted/.test(error.message)) {
      return NextResponse.json({ error: 'Commercial decision forbidden' }, { status: 403, headers })
    }
    console.error('Commercial decision failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Commercial decision unavailable' }, { status: 503, headers })
  }
}
