import type { Payload } from 'payload'
import type { Locale } from '../../i18n/config.ts'

export type PublicBarberProfile = {
  id: number
  slug: string
  name: string
  bio: string | null
  location: { id: number; name: string; city: string; address: string }
  portrait: { url: string; alt: string } | null
  offerings: Array<{ id: number; name: string; price: number; durationMinutes: number }>
  reviews: Array<{ id: number; rating: number; comment: string; publishedAt: string | null }>
  reviewCount: number
  averageRating: number | null
}

export function safeBarberSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120
}

function relationId(value: number | { id: number } | null | undefined): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  return value && Number.isSafeInteger(value.id) && value.id > 0 ? value.id : null
}

/** Published-only public read model: intentionally omits user bindings,
 * private drafts, internal booking fields and unpublished reviews.
 * No fake availability, awards, social accounts or portfolio media.
 */
export async function loadPublicBarberProfile(
  payload: Pick<Payload, 'find' | 'findByID'>,
  slug: string,
  locale: Locale,
): Promise<PublicBarberProfile | null> {
  if (!safeBarberSlug(slug)) return null

  const found = await payload.find({
    collection: 'barbers',
    locale,
    overrideAccess: true,
    depth: 1,
    limit: 2,
    where: { and: [{ slug: { equals: slug } }, { isActive: { equals: true } }] },
  })
  if (found.docs.length !== 1) return null
  const barber = found.docs[0]
  const locationId = relationId(barber.location)
  if (!locationId) return null

  const location = await payload.findByID({
    collection: 'locations', id: locationId, depth: 0,
    overrideAccess: true, locale,
  })
  if (!location.isActive) return null

  const activeServices = await payload.find({
    collection: 'services', locale, depth: 0,
    overrideAccess: true, limit: 100,
    where: { isActive: { equals: true } },
  })
  if (activeServices.hasNextPage) {
    throw new Error('Public service catalog exceeds supported limit')
  }
  const byId = new Map(activeServices.docs.map(item => [Number(item.id), item]))
  const seen = new Set<number>()
  const offerings: PublicBarberProfile['offerings'] = []
  for (const offering of barber.serviceOfferings ?? []) {
    const id = relationId(offering.service)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const service = byId.get(id)
    if (!service) continue
    const price = offering.priceOverride ?? service.price
    const durationMinutes = offering.durationOverrideMinutes ?? service.durationMinutes
    if (!Number.isSafeInteger(price) || price < 0 ||
        !Number.isSafeInteger(durationMinutes) || durationMinutes < 5 ||
        durationMinutes > 480) continue
    offerings.push({ id, name: service.name, price, durationMinutes })
  }

  const reviews = await payload.find({
    collection: 'reviews', depth: 0, overrideAccess: true,
    limit: 100, sort: '-publishedAt',
    where: { and: [
      { barber: { equals: barber.id } },
      { status: { equals: 'published' } },
    ] },
  })
  // Never fabricate an average from a truncated sample.
  // Use a null average until all published ratings are available.
  const complete = !reviews.hasNextPage
  const ratings = reviews.docs.map(item => item.rating)
    .filter((value): value is number => typeof value === 'number' &&
      Number.isInteger(value) && value >= 1 && value <= 5)
  const averageRating = complete && ratings.length === reviews.docs.length && ratings.length > 0
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : null
  const portrait = barber.portrait && typeof barber.portrait === 'object' &&
    typeof barber.portrait.url === 'string' &&
    barber.portrait.url.startsWith('/') && !barber.portrait.url.startsWith('//')
    ? { url: barber.portrait.url, alt: barber.portrait.alt || barber.name }
    : null
  const localizedBio = typeof barber.localizedBio === 'string' && barber.localizedBio.trim()
    ? barber.localizedBio.trim()
    : typeof barber.bio === 'string' && barber.bio.trim() ? barber.bio.trim() : null

  return {
    id: Number(barber.id),
    slug: barber.slug,
    name: barber.name,
    bio: localizedBio,
    location: { id: locationId, name: location.name, city: location.city, address: location.address },
    portrait,
    offerings,
    reviews: reviews.docs.slice(0, 6).map(item => ({
      id: Number(item.id), rating: item.rating, comment: item.comment,
      publishedAt: item.publishedAt ?? null,
    })),
    reviewCount: reviews.totalDocs,
    averageRating,
  }
}
