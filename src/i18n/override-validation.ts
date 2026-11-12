/**
 * Restrict CMS translation overrides to existing versioned dictionary keys.
 * This prevents arbitrary keys, HTML-like payloads and unbounded JSON.
 */
import { uk } from './messages/uk.ts'

type Dictionary = Record<string, unknown>

function flatten(value: Dictionary, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') return [path]
    // Array-valued dictionary entries (e.g. booking.steps) must remain arrays.
    // Flat string overrides cannot safely replace them.
    if (Array.isArray(child)) return []
    if (child && typeof child === 'object') return flatten(child as Dictionary, path)
    return []
  })
}

const allowed = new Set(flatten(uk as unknown as Dictionary))

export function validateTranslationOverrides(value: unknown): true | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Translations must be a flat object of dictionary keys and strings.'
  const entries = Object.entries(value)
  if (entries.length > 250) return 'Too many translation overrides.'
  for (const [key, text] of entries) {
    if (!allowed.has(key)) return `Unknown translation key: ${key}`
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) return `Invalid translation for ${key}`
    if (/[<>]/.test(text)) return `Markup is not permitted in ${key}`
  }
  return true
}
