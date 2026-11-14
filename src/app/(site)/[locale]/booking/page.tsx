import Link from 'next/link'
import type { Metadata } from 'next'
import { generatePublicPageMetadata } from '@/i18n/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return generatePublicPageMetadata(params, 'booking')
}

import { getPayload } from 'payload'
import { headers } from 'next/headers'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { loadPublicMessages } from '@/i18n/load-public-messages'
import { isLocale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { BookingWizard } from '@/components/booking-wizard'
import { loadPublicCatalog } from '@/lib/catalog/public-catalog'
import { bookingWritesEnabled } from '@/lib/booking/booking-write-guard'

export const dynamic = 'force-dynamic'

export default async function BookingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = await loadPublicMessages(locale)
  const payload = await getPayload({ config })
  const [catalog, auth] = await Promise.all([
    loadPublicCatalog(payload, {}, locale),
    headers().then(requestHeaders => payload.auth({ headers: requestHeaders })),
  ])
  const verifiedUser = auth.user
  const initialContact = verifiedUser && 'email' in verifiedUser && typeof verifiedUser.email === 'string'
    ? {
      name: 'displayName' in verifiedUser && typeof verifiedUser.displayName === 'string'
        ? verifiedUser.displayName : '',
      email: verifiedUser.email,
    } : undefined
  const locations = catalog.locations.map(item => ({ id: Number(item.id), name: String(item.name), city: String(item.city), timeZone: String(item.timeZone) }))
  const services = catalog.services.map(item => ({ id: Number(item.id), name: String(item.name) }))
  const barbers = catalog.barbers.map(item => ({
    id: Number(item.id),
    name: String(item.name),
    locationId: typeof item.location === 'number' ? item.location : Number(item.location.id),
    serviceIds: (item.serviceOfferings ?? []).map((offering: { service: number | { id: number | string } }) => typeof offering.service === 'number' ? offering.service : Number(offering.service.id)),
  }))
  // Server request time is intentionally dynamic; never computed during client render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  return <main className="landing">
    <SiteHeader locale={locale} messages={t} />
    <div className="catalog-page">
      <p className="eyebrow">Gentlemen’s Barbershop</p>
      <h1>{t.booking.title}</h1>
      <p className="catalog-intro">{t.booking.intro}</p>
      <Link className="catalog-inline-link" href={`/${locale}/booking/cancel`}>
        {t.guestCancellation.title}
      </Link>
      <BookingWizard locations={locations} barbers={barbers} services={services} nowIso={nowIso} locale={locale} messages={t} initialContact={initialContact} bookingEnabled={bookingWritesEnabled(process.env)} />
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
