/** Fixed v1.0 locale allowlist. Admin-managed locales are intentionally out of scope. */
export const locales = ['uk', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'uk'

export function isLocale(value: string): value is Locale {
  return locales.some(locale => locale === value)
}
