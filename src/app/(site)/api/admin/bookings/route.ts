import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  AdminBookingAccessError, getAdminBookings,
  type AdminBookingQuery,
} from '@/lib/booking/admin-booking-operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const allowed = new Set(['page', 'limit', 'locationId', 'barberId', 'status', 'date'])
    if ([...url.searchParams.keys()].some(key =>
      !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
      return NextResponse.json({ error: 'Invalid admin booking query' }, { status: 400, headers })
    }
    const integer = (key: string): number | undefined => {
      const value = url.searchParams.get(key)
      if (value == null) return undefined
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new RangeError('Invalid booking filter')
      }
      return Number(value)
    }
    const options: AdminBookingQuery = {
      page: integer('page'), limit: integer('limit'),
      locationId: integer('locationId'), barberId: integer('barberId'),
      status: (url.searchParams.get('status') ?? undefined) as AdminBookingQuery['status'],
      date: url.searchParams.get('date') ?? undefined,
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role } : null
    const result = await getAdminBookings(payload, actor, options)
    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof AdminBookingAccessError) return NextResponse.json({
      error: 'Administrator authentication required',
    }, { status: 403, headers })
    if (error instanceof RangeError) return NextResponse.json({
      error: 'Invalid admin booking query',
    }, { status: 400, headers })
    console.error('Admin booking inventory failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Admin booking inventory unavailable' }, { status: 500, headers })
  }
}
