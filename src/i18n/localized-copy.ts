/**
 * New optional localized fields coexist with the original legacy columns.
 * Payload resolves the requested locale (with its configured fallback).
 * An empty translation never hides previously published legacy copy.
 */
export function localizedCopy(
  record: object,
  localizedField: 'localizedDescription' | 'localizedBio',
  legacyField: 'description' | 'bio',
): string | null {
  const values = record as Record<string, unknown>
  for (const field of [localizedField, legacyField]) {
    const value = values[field]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}
