import { getFallbackMessages } from './messages/index.ts'
import type { Locale } from './config.ts'
import { validateTranslationOverrides } from './override-validation.ts'

type Dictionary = Record<string, unknown>

/**
 * Apply only validated, published CMS entries to the versioned dictionary.
 * Never mutate the shared fallback object; each request receives its own copy.
 */
export function resolvePublishedMessages(
  locale: Locale,
  record: { status?: string; locale?: string; entries?: unknown } | null,
) {
  const base = getFallbackMessages(locale)
  if (!record || record.status !== 'published' || record.locale !== locale ||
      validateTranslationOverrides(record.entries) !== true) return base
  const result = structuredClone(base) as unknown as Dictionary
  for (const [path, value] of Object.entries(record.entries as Record<string, string>)) {
    const segments = path.split('.')
    let node: Dictionary = result
    for (const segment of segments.slice(0, -1)) node = node[segment] as Dictionary
    node[segments[segments.length - 1]] = value
  }
  return result as unknown as typeof base
}
