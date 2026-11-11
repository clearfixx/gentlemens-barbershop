import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { listManagedBookings } from '@/lib/booking/list-managed-bookings'
import { BookingManagementError } from '@/lib/booking/manage-booking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || !('role' in user) || typeof user.role !== 'string') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers })
    }
    const url = new URL(request.url)
    const allowedParams = new Set(['page', 'limit'])
    if ([...url.searchParams.keys()].some(key => !allowedParams.has(key))) {
      return NextResponse.json({ error: 'Invalid query parameter' }, { status: 400, headers })
    }
    const parsePositive = (key: string, fallback: number) => {
      const values = url.searchParams.getAll(key)
      if (values.length === 0) return fallback
      if (values.length !== 1 || !/^[1-9]\\d*$/.test(values[0])) {
        throw new BookingManagementError(400, 'Invalid pagination')
      }
      return Number(values[0])
    }
    const result = await listManagedBookings({
      payload,
      principal: { id: Number(user.id), role: user.role },
      page: parsePositive('page', 1),
      limit: parsePositive('limit', 20),
    })
    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof BookingManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode, headers })
    }
    console.error('Booking history failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking history unavailable' }, { status: 500, headers })
  }
}
