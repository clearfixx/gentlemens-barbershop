import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { BookingBodyError, readBookingBody } from '@/lib/booking/read-booking-body'
import { submitPrivatePortfolioDraft, PortfolioSubmissionConflict } from '@/lib/admin/submit-private-portfolio-draft'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Backend-only submit contract for the future barber workspace.
 * This route NEVER publishes media or creates a public Media record.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON' }, { status: 415, headers: noStore })
    }
    const { id } = await params
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'Invalid draft identifier' },
        { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'barber') {
      return NextResponse.json({ error: 'Private portfolio draft unavailable' },
        { status: 404, headers: noStore })
    }
    const body: unknown = await readBookingBody(request, 16 * 1024)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.hasOwn(body, 'portfolio')) {
      return NextResponse.json({ error: 'Invalid portfolio submission body' },
        { status: 400, headers: noStore })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const accepted = await submitPrivatePortfolioDraft(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), (body as Record<string, unknown>).portfolio)
    return NextResponse.json(accepted, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookingBodyError) {
      return NextResponse.json({ error: error.message },
        { status: error.status, headers: noStore })
    }
    if (error instanceof PortfolioSubmissionConflict) {
      return NextResponse.json({ error: 'Portfolio submission unavailable or changed' },
        { status: 409, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid portfolio order, references or declarations' },
        { status: 422, headers: noStore })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Private portfolio submission unavailable',
      error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Private portfolio submission unavailable' },
      { status: 503, headers: noStore })
  }
}
