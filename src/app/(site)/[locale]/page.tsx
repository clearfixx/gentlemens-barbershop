import { localizedCopy } from '@/i18n/localized-copy'
import type { Metadata } from 'next'
import { generatePublicPageMetadata } from '@/i18n/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return generatePublicPageMetadata(params, 'home')
}

import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { getFallbackMessages } from '@/i18n/messages'
import { isLocale } from '@/i18n/config'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = getFallbackMessages(locale)
  const payload = await getPayload({ config })
  const [services, barbers, locations] = await Promise.all([
    payload.find({ collection: 'services', locale, depth: 0, limit: 30, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'barbers', locale, depth: 1, limit: 30, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'locations', locale, depth: 0, limit: 30, sort: 'name', overrideAccess: false }),
  ])
  return <main id="top" className="landing">
    <SiteHeader locale={locale} />
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">{t.home.eyebrow}</p>
        <h1 id="hero-title">{t.home.heroLine1}<br/>{t.home.heroLine2}<br/><em>{t.home.heroAccent}</em></h1>
        <p>{t.home.heroIntro}</p>
        <div className="hero-actions"><Link className="cta" href={`/${locale}/booking`}>{t.actions.planVisit}</Link><a href="#about">{t.home.learnMore} ↗</a></div>
      </div>
      <div className="hero-art" role="img" aria-label={t.home.heroArtLabel}><span>✦<small>GENTLEMEN’S BARBERSHOP</small></span></div>
      <a className="scroll-hint scroll-mouse" href="#about" aria-label={t.home.scrollLabel}><svg viewBox="0 0 32 48" width="32" height="48" fill="none" aria-hidden="true"><rect x="5" y="2" width="22" height="42" rx="11" stroke="currentColor" strokeWidth="1.5"/><path d="M16 11v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></a>
    </section>
    <section id="about" className="content-section"><p className="eyebrow">{t.home.whyEyebrow}</p><h2>{t.home.whyTitle}</h2><p>{t.home.whyIntro}</p></section>
    <section id="philosophy" className="cinematic-section philosophy-scene" aria-labelledby="philosophy-title"><div className="cinematic-copy"><p className="eyebrow">{t.home.philosophyEyebrow}</p><h2 id="philosophy-title">{t.home.philosophyTitle}</h2><p>{t.home.philosophyIntro}</p><Link className="cinematic-link" href={`/${locale}/booking`}>{t.home.chooseTime} →</Link></div></section>
    <section id="services" className="content-section alt"><p className="eyebrow">{t.home.servicesEyebrow}</p><h2>{t.home.servicesTitle}</h2>{services.docs.length ? <ul className="catalog-grid service-grid">{services.docs.map(service => <li className="catalog-card" key={service.id}><div className="catalog-card__top"><h3>{service.name}</h3><span className="catalog-card__price">{service.price} {t.common.currency}</span></div>{localizedCopy(service, 'localizedDescription', 'description') && <p>{localizedCopy(service, 'localizedDescription', 'description')}</p>}<div className="catalog-card__meta"><span>{service.durationMinutes} {t.common.minutes}</span><span aria-hidden="true">✦</span></div></li>)}</ul> : <p>{t.home.servicesEmpty}</p>}<p><Link className="catalog-inline-link" href={`/${locale}/catalog`}>{t.home.fullCatalog} →</Link></p></section>
    <section id="team" className="content-section"><p className="eyebrow">{t.home.teamEyebrow}</p><h2>{t.home.teamTitle}</h2>{barbers.docs.length ? <ul className="catalog-grid team-grid">{barbers.docs.map(barber => <li className="catalog-card team-card" key={barber.id}>{barber.portrait && typeof barber.portrait === 'object' && barber.portrait.url ? <img className="team-card__portrait" src={barber.portrait.url} alt={barber.portrait.alt || `${t.home.barberPortrait} ${barber.name}`} loading="lazy" /> : <div className="team-card__monogram" aria-hidden="true">{barber.name.slice(0, 1).toLocaleUpperCase('uk')}</div>}<h3>{barber.name}</h3>{localizedCopy(barber, 'localizedBio', 'bio') && <p>{localizedCopy(barber, 'localizedBio', 'bio')}</p>}</li>)}</ul> : <p>{t.home.teamEmpty}</p>}<p><Link className="catalog-inline-link" href={`/${locale}/catalog`}>{t.home.allBarbers} →</Link></p></section>
    <section id="locations" className="content-section alt"><p className="eyebrow">{t.home.locationsEyebrow}</p><h2>{t.home.locationsTitle}</h2>{locations.docs.length ? <ul className="catalog-grid location-grid">{locations.docs.map(location => <li className="catalog-card location-card" key={location.id}><span className="catalog-card__kicker">{location.city}</span><h3>{location.name}</h3><address>{location.address}</address>{location.phone && <a href={`tel:${location.phone.replace(/[^+\\d]/g, '')}`}>{location.phone}</a>}{localizedCopy(location, 'localizedDescription', 'description') && <p>{localizedCopy(location, 'localizedDescription', 'description')}</p>}</li>)}</ul> : <p>{t.home.locationsEmpty}</p>}</section>
    <section id="booking" className="cinematic-section final-booking-scene" aria-labelledby="booking-title"><div className="cinematic-copy"><p className="eyebrow">{t.home.finalEyebrow}</p><h2 id="booking-title">{t.home.finalTitle}</h2><p>{t.home.finalIntro}</p><Link className="cta" href={`/${locale}/booking`}>{t.actions.planVisit}</Link></div></section>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
