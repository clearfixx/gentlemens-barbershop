import { uk } from './uk.ts'
import { en } from './en.ts'
import { defaultLocale, type Locale } from '../config.ts'

export const messages = { uk, en } as const

/** Versioned fallback: CMS overrides may replace these values after validation. */
export function getFallbackMessages(locale: Locale) {
  return messages[locale] ?? messages[defaultLocale]
}
