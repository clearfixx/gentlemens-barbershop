import type { Metadata } from 'next'
import { getFallbackMessages } from './messages'
import { isLocale, locales, type Locale } from './config'

type PublicPage = 'home' | 'catalog' | 'booking' | 'availability'

/**
 * Do not emit invalid absolute canonical/hreflang URLs before a production
 * origin is configured. Booking and live availability are not indexable.
 */
function configuredOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return url.origin
  } catch {
    return null
  }
}

export function publicPageMetadata(locale: Locale, page: PublicPage): Metadata {
  const t = getFallbackMessages(locale)
  const title = page === 'home' ? 'Gentlemen’s Barbershop' : `Gentlemen’s Barbershop | ${page === 'catalog' ? t.catalog.title : page === 'booking' ? t.booking.title : t.availability.title}`
  const description = page === 'home' ? t.home.heroIntro : page === 'catalog' ? t.catalog.intro : page === 'booking' ? t.booking.intro : t.availability.intro
  const indexable = page === 'home' || page === 'catalog'
  const origin = configuredOrigin()
  const suffix = page === 'home' ? '' : `/${page}`
  const alternates = indexable && origin ? {
    canonical: `${origin}/${locale}${suffix}`,
    languages: Object.fromEntries(locales.map(language => [language, `${origin}/${language}${suffix}`])),
  } : undefined
  return { title, description, robots: indexable ? { index: true, follow: true } : { index: false, follow: false }, alternates }
}

export async function generatePublicPageMetadata(params: Promise<{ locale: string }>, page: PublicPage): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return { robots: { index: false, follow: false } }
  return publicPageMetadata(locale, page)
}
