import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { AVATAR_MAX_BYTES, validateAvatarBytes } from '@/lib/account/avatar-image'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const cacheHeaders = { 'Cache-Control': 'private, no-store' }

async function currentCustomer() {
  const payload = await getPayload({ config })
  const session = await payload.auth({ headers: await headers() })
  const user = session.user
  if (!user || (user.role !== 'customer' && user.role !== 'admin')) return null
  return { payload, user }
}

/** A customer cannot bypass the Media collection's admin-only upload ACL. */
export async function POST(request: Request) {
  const identity = await currentCustomer()
  if (!identity) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: cacheHeaders })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers: cacheHeaders })
  }
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > AVATAR_MAX_BYTES + 4096) {
    return NextResponse.json({ error: 'Photo too large' }, { status: 413, headers: cacheHeaders })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
    return NextResponse.json({ error: 'Expected image upload' }, { status: 415, headers: cacheHeaders })
  }
  try {
    const form = await request.formData()
    if (Array.from(form.keys()).some(key => key !== 'avatar')) {
      return NextResponse.json({ error: 'Invalid upload fields' }, { status: 400, headers: cacheHeaders })
    }
    const file = form.get('avatar')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Photo missing' }, { status: 400, headers: cacheHeaders })
    if (file.size > AVATAR_MAX_BYTES || file.size < 1) {
      return NextResponse.json({ error: 'Photo too large or empty' }, { status: 413, headers: cacheHeaders })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const { extension, mimeType } = validateAvatarBytes(file.type, bytes)
    const { payload, user } = identity
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Customer profile picture' },
      file: { data: bytes, mimetype: mimeType, name: `avatar-${user.id}-${randomUUID()}.${extension}`, size: bytes.length },
      overrideAccess: true,
    })
    // Trusted endpoint only. Customers cannot PATCH users.avatar or POST media.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { avatar: media.id },
      overrideAccess: true,
    })
    return NextResponse.json({ avatarUrl: media.url, avatarId: media.id }, { headers: cacheHeaders })
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 415, headers: cacheHeaders })
    }
    console.error('Account avatar upload unavailable', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ error: 'Avatar could not be saved' }, { status: 503, headers: cacheHeaders })
  }
}

/** Removing the avatar does not delete historical media referenced elsewhere. */
export async function DELETE(request: Request) {
  const identity = await currentCustomer()
  if (!identity) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: cacheHeaders })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers: cacheHeaders })
  }
  await identity.payload.update({
    collection: 'users', id: identity.user.id, data: { avatar: null }, overrideAccess: true,
  })
  return NextResponse.json({ avatarUrl: null }, { headers: cacheHeaders })
}
