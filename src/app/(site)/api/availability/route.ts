import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getPublicAvailability } from '@/lib/catalog/get-public-availability'
import { parseAvailabilityInput } from '@/lib/catalog/public-availability'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  let input
  try {
    input = parseAvailabilityInput(new URL(request.url).searchParams)
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid availability query' }, { status: 400, headers })
    }
    throw error
  }
  const payload = await getPayload({ config })
  const result = await getPublicAvailability(payload, input)
  if (!result) return NextResponse.json({ error: 'Service or barber unavailable' }, { status: 404, headers })
  return NextResponse.json(result, { headers })
}
