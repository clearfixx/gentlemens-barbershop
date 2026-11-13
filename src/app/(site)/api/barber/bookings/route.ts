import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { BarberAccessError, getOwnBarberBookings } from '@/lib/booking/barber-booking-operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'Cache-Control': 'private, no-store' }

/** Staff agenda read: only the barber linked to the verified Payload user. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const allowed = new Set(['date', 'page', 'limit'])
    if ([...url.searchParams.keys()].some(key =>
      !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
      return NextResponse.json({ error: 'Invalid barber agenda query' }, { status: 400, headers: noStore })
    }
    const parseNumber = (value: string | null): number | undefined => {
      if (value === null) return undefined
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new RangeError('Invalid barber agenda pagination')
      }
      return Number(value)
    }
    const date = url.searchParams.get('date')
    if (date === null) return NextResponse.json({ error: 'Date required' }, { status: 400, headers: noStore })
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })
    const user = auth.user
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role } : null
    const agenda = await getOwnBarberBookings(payload, actor, {
      date, page: parseNumber(url.searchParams.get('page')), limit: parseNumber(url.searchParams.get('limit')),
    })
    return NextResponse.json(agenda, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BarberAccessError) {
      return NextResponse.json({ error: 'Barber authentication required' }, { status: 403, headers: noStore })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid barber agenda query' }, { status: 400, headers: noStore })
    }
    console.error('Barber agenda failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Barber agenda unavailable' }, { status: 500, headers: noStore })
  }
}
