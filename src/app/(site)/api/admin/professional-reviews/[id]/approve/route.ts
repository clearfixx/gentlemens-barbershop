import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { approveProfessionalBiography } from '@/lib/admin/approve-professional-biography'
import { ProfessionalReviewConflictError } from '@/lib/admin/professional-approval-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Approval accepts NO proposed content from the HTTP client.
 * The locked, validated pending record and current published barber row are
 * the only sources. Non-biography fields fail closed in the domain service.
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
    // Reject any request stream before reading it. Browser action sends no body,
    // so the client cannot inject proposed content or unbounded JSON.
    if (request.body !== null) {
      return NextResponse.json({ error: 'Approval request body must be empty' },
        { status: 400, headers: noStore })
    }
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Administrative requests temporarily limited' }, {
        status: 429,
        headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const outcome = await approveProfessionalBiography(payload, Number(id),
      { id: Number(user.id), role: 'admin' })
    return NextResponse.json(outcome, { headers: noStore })
  } catch (error) {
    if (error instanceof ProfessionalReviewConflictError) {
      return NextResponse.json({ error: 'Proposal is outdated. Refresh the review.' },
        { status: 409, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Only valid biography-only revisions can be approved' },
        { status: 422, headers: noStore })
    }
    if (error instanceof Error && /origin|forbidden|self-approval/i.test(error.message)) {
      return NextResponse.json({ error: 'Professional approval forbidden' },
        { status: 403, headers: noStore })
    }
    console.error('Professional approval failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Professional approval unavailable' },
      { status: 503, headers: noStore })
  }
}
