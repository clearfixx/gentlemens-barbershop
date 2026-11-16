import { createHash } from 'node:crypto'

export type BarberProfileLocale = 'uk' | 'en'

export function localizedBiographyRevision(input: {
  barberId: number
  locationId: number
  authorId: number
  locale: BarberProfileLocale
  value: string | null
}): string {
  if (![input.barberId, input.locationId, input.authorId].every(v =>
    Number.isSafeInteger(v) && v > 0) ||
      !['uk', 'en'].includes(input.locale)) {
    throw new RangeError('Invalid localized biography identity')
  }
  if (input.value !== null &&
      (typeof input.value !== 'string' || input.value.length > 8000)) {
    throw new RangeError('Invalid localized biography')
  }
  return createHash('sha256').update(JSON.stringify([
    'barber-localized-bio-v1', input.barberId, input.locationId,
    input.authorId, input.locale, input.value,
  ])).digest('hex')
}

export function validateLocalizedBiographyProposal(snapshot: unknown, changes: unknown): {
  locale: BarberProfileLocale
  previous: string | null
  proposed: string | null
} {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new RangeError('Invalid localized biography proposal')
  }
  const before = snapshot as Record<string, unknown>
  const after = changes as Record<string, unknown>
  if (Object.keys(before).length !== 1 || Object.keys(after).length !== 1 ||
      !Object.hasOwn(before, 'localizedBio') || !Object.hasOwn(after, 'localizedBio')) {
    throw new RangeError('Localized biography proposal contains unsupported fields')
  }
  const parse = (entry: unknown): { locale: BarberProfileLocale; value: string | null } => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new RangeError('Invalid localized biography patch')
    }
    const record = entry as Record<string, unknown>
    if (Object.keys(record).length !== 2 ||
        !Object.hasOwn(record, 'locale') || !Object.hasOwn(record, 'value') ||
        (record.locale !== 'uk' && record.locale !== 'en') ||
        (record.value !== null &&
          (typeof record.value !== 'string' || record.value.length > 8000))) {
      throw new RangeError('Invalid localized biography patch')
    }
    return { locale: record.locale, value: record.value as string | null }
  }
  const old = parse(before.localizedBio)
  const next = parse(after.localizedBio)
  if (old.locale !== next.locale || old.value === next.value) {
    throw new RangeError('Localized biography patch must change one locale')
  }
  return { locale: next.locale, previous: old.value, proposed: next.value }
}
