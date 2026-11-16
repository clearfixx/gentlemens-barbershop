import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { assertCommercialMutationOrigin } from '@/lib/admin/commercial-http'
import { checkCommercialWriteBudget } from '@/lib/admin/commercial-write-budget'
import { PRIVATE_PORTFOLIO_MAX_BYTES, readPrivatePortfolioUploadBody } from '@/lib/admin/private-portfolio-png'
import { PrivatePortfolioUploadForbidden, stagePrivatePortfolioImage } from '@/lib/admin/stage-private-portfolio-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Shared backend intake used by the future barber-owned draft workflow.
 * No barber dashboard/UI is created in this admin workstream. No publishing.
 * Raw PNG bytes only; the server derives identity, draft and byte metadata.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'image/png') {
      return NextResponse.json({ error: 'Only PNG is accepted for private draft staging' },
        { status: 415, headers: noStore })
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
    const budget = await checkCommercialWriteBudget(payload, Number(user.id))
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Upload temporarily limited' }, {
        status: 429,
        headers: { ...noStore, 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }
    const raw = await readPrivatePortfolioUploadBody(request, PRIVATE_PORTFOLIO_MAX_BYTES)
    const image = await stagePrivatePortfolioImage(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), raw)
    return NextResponse.json(image, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof PrivatePortfolioUploadForbidden) {
      return NextResponse.json({ error: 'Private portfolio draft unavailable' },
        { status: 404, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message },
        { status: /limit|large|bytes/i.test(error.message) ? 413 : 422, headers: noStore })
    }
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers: noStore })
    }
    console.error('Private portfolio intake unavailable',
      error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Private portfolio intake unavailable' },
      { status: 503, headers: noStore })
  }
}
