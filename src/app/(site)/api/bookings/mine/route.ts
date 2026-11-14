import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { bookingHttpError } from '@/lib/booking/booking-http'
import { getOwnBookingHistory, type BookingHistoryFilter } from '@/lib/booking/get-own-booking-history'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * Read-only, authenticated customer history. Production write gate is not
 * applicable to reads. Never accept customerId, role, or identity headers.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const allowed = new Set(['page', 'limit', 'filter'])
    if ([...url.searchParams.keys()].some(key =>
      !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
      return NextResponse.json({ error: 'Invalid booking history query' }, { status: 400, headers: noStore })
    }
    const integer = (value: string | null): number | undefined => {
      if (value === null) return undefined
      if (!/^[1-9][0-9]*$/.test(value)) throw new RangeError('Invalid booking history pagination')
      const number = Number(value)
      if (!Number.isSafeInteger(number)) throw new RangeError('Invalid booking history pagination')
      return number
    }
    const page = integer(url.searchParams.get('page'))
    const limit = integer(url.searchParams.get('limit'))
    const filter = url.searchParams.get('filter') ?? 'all'
    if (!['all', 'upcoming', 'past'].includes(filter)) {
      return NextResponse.json({ error: 'Invalid booking history filter' }, { status: 400, headers: noStore })
    }
    const payload = await getPayload({ config })
    const authentication = await payload.auth({ headers: request.headers })
    const user = authentication.user
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role }
      : null
    const history = await getOwnBookingHistory(payload, actor, {
      page, limit, filter: filter as BookingHistoryFilter,
    })
    return NextResponse.json(history, { status: 200, headers: noStore })
  } catch (error) {
    const known = bookingHttpError(error)
    if (known) return NextResponse.json({ error: known.message }, { status: known.status, headers: noStore })
    console.error('Booking history failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking history unavailable' }, { status: 500, headers: noStore })
  }
}
