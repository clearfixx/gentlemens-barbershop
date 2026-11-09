import { uk } from './uk'
import { en } from './en'
import { defaultLocale, type Locale } from '../config'

export const messages = { uk, en } as const

/** Versioned fallback: CMS overrides may replace these values after validation. */
export function getFallbackMessages(locale: Locale) {
  return messages[locale] ?? messages[defaultLocale]
}
