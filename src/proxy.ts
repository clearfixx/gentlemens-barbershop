import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, isLocale } from '@/i18n/config'

/**
 * Locale prefixes are public-website concerns. Payload admin/API, internal API,
 * static assets and framework assets must retain their existing URLs.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.includes('.')
  ) return NextResponse.next()

  const first = pathname.split('/')[1]
  if (isLocale(first)) return NextResponse.next()

  // Let App Router handle the legacy public routes under the correct locale.
  const target = request.nextUrl.clone()
  target.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(target)
}

export const config = {
  matcher: ['/((?!_next|api|admin).*)'],
}
