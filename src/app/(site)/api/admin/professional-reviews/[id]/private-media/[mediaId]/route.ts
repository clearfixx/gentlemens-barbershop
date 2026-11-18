import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { readPrivatePortfolioReviewImage, PrivatePortfolioMediaNotFound } from '@/lib/admin/private-portfolio-review-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': 'sandbox',
  'Vary': 'Cookie',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params
  if (!/^[1-9][0-9]*$/.test(id) || !/^[1-9][0-9]*$/.test(mediaId) ||
      !Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(Number(mediaId))) {
    return new NextResponse(null, { status: 404, headers: privateHeaders })
  }
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user || (user.role !== 'admin' && user.role !== 'location_admin')) {
      return new NextResponse(null, { status: 404, headers: privateHeaders })
    }
    const image = await readPrivatePortfolioReviewImage(payload, {
      id: Number(user.id), role: user.role,
    }, Number(id), Number(mediaId))
    return new NextResponse(Buffer.from(image.bytes), {
      status: 200,
      headers: {
        ...privateHeaders,
        'Content-Type': image.mimeType,
        'Content-Length': String(image.bytes.byteLength),
        'Content-Disposition': 'inline; filename="portfolio-review-image"',
      },
    })
  } catch (error) {
    if (error instanceof PrivatePortfolioMediaNotFound || error instanceof RangeError) {
      return new NextResponse(null, { status: 404, headers: privateHeaders })
    }
    console.error('Private portfolio preview unavailable',
      error instanceof Error ? error.name : 'UnknownError')
    return new NextResponse(null, { status: 503, headers: privateHeaders })
  }
}
