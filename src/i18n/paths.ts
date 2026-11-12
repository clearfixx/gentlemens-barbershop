import { isLocale, type Locale } from '@/i18n/config'

/** Keeps the locale switcher on the same page when a matching public route exists. */
export function localePath(locale: Locale, path = '') {
  const suffix = path && path !== '/' ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `/${locale}${suffix}`
}

export function getLocaleFromPath(pathname: string): Locale | null {
  const first = pathname.split('/')[1]
  return isLocale(first) ? first : null
}
