import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getAdminBookingAudit, AdminBookingAuditAccessError } from '@/lib/booking/admin-booking-audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url)
    if ([...url.searchParams.keys()].some(key =>
      (key !== 'page' && key !== 'limit') || url.searchParams.getAll(key).length !== 1)) {
      throw new RangeError('Invalid booking audit query')
    }
    const integer = (key: 'page' | 'limit'): number | undefined => {
      const value = url.searchParams.get(key)
      if (value === null) return undefined
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new RangeError('Invalid booking audit pagination')
      }
      return Number(value)
    }
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    const actor = user && 'role' in user && typeof user.role === 'string'
      ? { id: Number(user.id), role: user.role } : null
    const { id } = await context.params
    const page = await getAdminBookingAudit(payload, actor, id, {
      page: integer('page'), limit: integer('limit'),
    })
    return NextResponse.json(page, { status: 200, headers })
  } catch (error) {
    if (error instanceof AdminBookingAuditAccessError) {
      return NextResponse.json({ error: 'Administrator authentication required' }, {
        status: 403, headers,
      })
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid booking audit query' }, {
        status: 400, headers,
      })
    }
    console.error('Admin booking audit failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Booking audit unavailable' }, { status: 500, headers })
  }
}
