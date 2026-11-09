import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, isLocale } from '@/i18n/config'

/** Preserve Payload's admin/API URLs and only redirect public routes. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const segment = pathname.split('/')[1]
  if (isLocale(segment)) return NextResponse.next()

  if (pathname === '/' || ['/booking', '/catalog', '/availability'].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const target = request.nextUrl.clone()
    target.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(target)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/booking/:path*', '/catalog/:path*', '/availability/:path*'],
}
