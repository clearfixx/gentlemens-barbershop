import type { Metadata } from 'next'
import { generatePublicPageMetadata } from '@/i18n/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return generatePublicPageMetadata(params, 'availability')
}

import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { getFallbackMessages } from '@/i18n/messages'
import { isLocale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { loadPublicCatalog, parseCatalogId } from '@/lib/catalog/public-catalog'
import { parseAvailabilityInput } from '@/lib/catalog/public-availability'
import { getPublicAvailability } from '@/lib/catalog/get-public-availability'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage({
  searchParams, params: routeParams,
}: {
  searchParams: Promise<{ barber?: string; service?: string; date?: string }>
  params: Promise<{ locale: string }>
}) {
  const { locale } = await routeParams
  if (!isLocale(locale)) notFound()
  const t = getFallbackMessages(locale)
  const params = await searchParams
  const payload = await getPayload({ config })
  const catalog = await loadPublicCatalog(payload, {}, locale)
  let result: Awaited<ReturnType<typeof getPublicAvailability>> = null
  let invalid = false
  if (params.barber || params.service || params.date) {
    try {
      const query = new URLSearchParams()
      if (params.barber) query.set('barber', params.barber)
      if (params.service) query.set('service', params.service)
      if (params.date) query.set('date', params.date)
      result = await getPublicAvailability(payload, parseAvailabilityInput(query))
    } catch (error) {
      if (error instanceof RangeError) invalid = true
      else throw error
    }
  }
  return <main className="landing" id="top">
    <SiteHeader locale={locale} />
    <div className="catalog-page">
      <Link href={`/${locale}/catalog`} className="catalog-back">← {t.availability.toCatalog}</Link>
      <p className="eyebrow">{t.availability.eyebrow}</p>
      <h1>{t.availability.title}</h1>
      <p className="catalog-intro">{t.availability.intro}</p>
      <form method="get" action={`/${locale}/availability`} className="catalog-filters">
        <label>{t.availability.barber}
          <select name="barber" required defaultValue={parseCatalogId(params.barber) ?? ''}>
            <option value="">{t.availability.selectBarber}</option>
            {catalog.barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
        </label>
        <label>{t.availability.service}
          <select name="service" required defaultValue={parseCatalogId(params.service) ?? ''}>
            <option value="">{t.availability.selectService}</option>
            {catalog.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label>{t.availability.date}
          <input type="date" name="date" required defaultValue={params.date ?? ''} />
        </label>
        <button className="cta" type="submit">{t.availability.check}</button>
      </form>
      {invalid && <p role="alert" className="catalog-empty">{t.availability.invalidDate}</p>}
      {!invalid && (params.barber || params.service || params.date) && !result && <p className="catalog-empty">{t.availability.unavailable}</p>}
      {result && <section aria-labelledby="slots-title">
        <h2 id="slots-title">{t.availability.slots} · {result.date}</h2>
        <p className="catalog-intro">{t.common.duration}: {result.durationMinutes} {t.common.minuteShort} · {t.common.price}: {result.price} {t.common.currency}</p>
        {result.slots.length ? <ul className="availability-slots">
          {result.slots.map(slot => <li key={slot.startsAt}><time dateTime={slot.startsAt}>
            {new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB', { timeZone: result.timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(slot.startsAt))}
          </time></li>)}
        </ul> : <p className="catalog-empty">{t.booking.empty}</p>}
        <p className="catalog-notice">{t.availability.notice}</p>
      </section>}
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
