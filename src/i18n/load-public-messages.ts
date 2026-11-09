import 'server-only'
import { getPayload } from 'payload'
import config from '@/payload.config'
import type { Locale } from './config'
import { getFallbackMessages } from './messages'
import { resolvePublishedMessages } from './resolve-overrides'

/**
 * Request-time, published-only CMS dictionary lookup.
 * No shared cache: a publish/unpublish is visible on the next request.
 * The public read uses a narrowly scoped Local API query, never an admin endpoint.
 */
export async function loadPublicMessages(locale: Locale) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'translations',
    where: { and: [{ locale: { equals: locale } }, { status: { equals: 'published' } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const record = result.docs[0]
  if (!record) return getFallbackMessages(locale)
  return resolvePublishedMessages(locale, {
    locale: typeof record.locale === 'string' ? record.locale : undefined,
    status: typeof record.status === 'string' ? record.status : undefined,
    entries: record.entries,
  })
}
