import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { approveProfessionalLocalizedBiography } from '@/lib/admin/approve-professional-localized-biography'
import { ProfessionalReviewConflictError } from '@/lib/admin/professional-approval-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Reviewer sends only the proposal ID; the server reads and validates all
 * localized content and revision data while holding the PostgreSQL row locks.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCommercialMutationOrigin(request)
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Network administrator required' },
        { status: 403, headers: noStore })
    }
    const { id } = await context.params
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'Invalid proposal identifier' },
        { status: 400, headers: noStore })
    }
    if (request.body !== null) {
      return NextResponse.json({ error: 'Approval request body must be empty' },
        { status: 400, headers: noStore })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const outcome = await approveProfessionalLocalizedBiography(payload, Number(id),
      { id: Number(user.id), role: 'admin' })
    return NextResponse.json(outcome, { headers: noStore })
  } catch (error) {
    if (error instanceof ProfessionalReviewConflictError) {
      return NextResponse.json({ error: 'Localized biography changed. Refresh the review.' },
        { status: 409, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Unsupported localized biography patch' },
        { status: 422, headers: noStore })
    }
    if (error instanceof Error && /origin|forbidden|self-approval/i.test(error.message)) {
      return NextResponse.json({ error: 'Professional approval forbidden' },
        { status: 403, headers: noStore })
    }
    console.error('Localized biography approval failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Professional approval unavailable' },
      { status: 503, headers: noStore })
  }
}
