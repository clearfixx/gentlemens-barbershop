import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { readBookingBody, BookingBodyError } from '@/lib/booking/read-booking-body'
import { assertCommercialMutationOrigin, parseTariffSubmission } from '@/lib/admin/commercial-http'
import { submitBarberTariffProposal } from '@/lib/admin/prepare-barber-tariff-proposal'
import { resolveLocationScope } from '@/lib/admin/location-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** A manager sees requests they submitted in currently assigned locations;
 * network administrators see the complete queue.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    if ([...url.searchParams.keys()].some(key => key !== 'status' ||
        url.searchParams.getAll(key).length !== 1)) {
      return NextResponse.json({ error: 'Invalid request filter' }, { status: 400, headers })
    }
    const status = url.searchParams.get('status')
    if (status !== null && !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request status' }, { status: 400, headers })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !('role' in user) || typeof user.role !== 'string') {
      return NextResponse.json({ error: 'Staff authentication required' }, { status: 403, headers })
    }
    const scope = await resolveLocationScope(payload, { id: Number(user.id), role: user.role })
    const filters = []
    if (status) filters.push({ status: { equals: status } })
    if (scope.role !== 'admin') {
      filters.push({ createdBy: { equals: scope.userId } })
      filters.push({ location: { in: scope.locationIds } })
    }
    const result = await payload.find({
      collection: 'commercial-change-requests', overrideAccess: true, depth: 0,
      limit: 50, sort: '-createdAt',
      ...(filters.length ? { where: { and: filters } } : {}),
    })
    return NextResponse.json({ docs: result.docs, hasNextPage: result.hasNextPage }, { headers })
  } catch (error) {
    console.error('Commercial request list failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Commercial requests unavailable' }, { status: 503, headers })
  }
}

/** Submission persists pending proposals only; the live tariff is untouched. */
export async function POST(request: Request) {
  try {
    assertCommercialMutationOrigin(request)
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415, headers })
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !('role' in user) || typeof user.role !== 'string' ||
        !['admin', 'location_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Staff authentication required' }, { status: 403, headers })
    }
    const body = parseTariffSubmission(await readBookingBody(request, 4096))
    const created = await submitBarberTariffProposal(payload,
      { id: Number(user.id), role: user.role }, body)
    return NextResponse.json({ id: created.id, status: 'pending' }, { status: 201, headers })
  } catch (error) {
    if (error instanceof BookingBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    if (error instanceof RangeError) return NextResponse.json({ error: 'Invalid proposal' }, { status: 400, headers })
    if (error instanceof Error && /origin/i.test(error.message)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
    }
    if (error instanceof Error && /forbidden|assignment|authentication|assigned locations/i.test(error.message)) {
      return NextResponse.json({ error: 'Location access forbidden' }, { status: 403, headers })
    }
    console.error('Commercial request creation failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Commercial request unavailable' }, { status: 503, headers })
  }
}
