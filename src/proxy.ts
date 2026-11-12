import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale } from '@/i18n/config'

/** Only public paths are redirected. Payload and API routes are untouched. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/' || ['/booking', '/catalog', '/availability'].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const target = request.nextUrl.clone()
    target.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(target)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/', '/booking/:path*', '/catalog/:path*', '/availability/:path*'] }
