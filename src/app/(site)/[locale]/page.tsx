import './home-page.css'

import Link from 'next/link'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { HeroSlider } from '@/components/hero-slider'
import { SiteHeader } from '@/components/site-header'
import { isLocale } from '@/i18n/config'
import { loadPublicMessages } from '@/i18n/load-public-messages'
import { localizedCopy } from '@/i18n/localized-copy'
import { generatePublicPageMetadata } from '@/i18n/seo'
import config from '@/payload.config'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return generatePublicPageMetadata(params, 'home')
}

export const dynamic = 'force-dynamic'

function BenefitIcon({ index }: { index: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (index === 0) return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}><circle cx="12" cy="34" r="5"/><circle cx="28" cy="34" r="5"/><path d="M15 30 38 9M30 30 9 9M23 24 39 39M36 10l3-3"/></svg>
  if (index === 1) return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}><path d="m6 17 8 7 10-14 10 14 8-7-4 22H10L6 17Z"/><circle cx="6" cy="15" r="2"/><circle cx="24" cy="8" r="2"/><circle cx="42" cy="15" r="2"/></svg>
  if (index === 2) return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}><path d="M10 16h13v24H10zM13 10h7v6h-7zM12 7h9M29 21h11v19H29zM32 16h5v5h-5zM32 12h5M13 25h7M32 29h5"/></svg>
  if (index === 3) return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}><rect x="9" y="9" width="30" height="23" rx="7"/><rect x="15" y="20" width="18" height="8" rx="3"/><path d="M12 32v8M36 32v8M5 24h6M37 24h6M18 13h12"/></svg>
  return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}><path d="M13 9h22l9 12-20 20L4 21 13 9Zm-9 12h40M13 9l5 12 6 20 6-20 5-12"/></svg>
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = await loadPublicMessages(locale)
  const payload = await getPayload({ config })
  const [services, barbers, locations] = await Promise.all([
    payload.find({ collection: 'services', locale, depth: 0, limit: 8, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'barbers', locale, depth: 1, limit: 8, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'locations', locale, depth: 0, limit: 8, sort: 'name', overrideAccess: false }),
  ])

  const uk = locale === 'uk'
  const labels = uk ? {
    benefits: 'ЧОМУ ОБИРАЮТЬ НАС',
    team: 'НАШІ МАЙСТРИ',
    reviews: 'ВІДГУКИ КЛІЄНТІВ',
    products: 'ТОП ТОВАРИ',
    findUs: 'ЯК НАС ЗНАЙТИ',
    questions: 'ЗАЛИШИЛИСЬ ПИТАННЯ?',
    social: 'МИ В СОЦМЕРЕЖАХ',
    intro: 'Ми поєднуємо традиції барбер-культури з сучасним сервісом, щоб ти завжди виглядав бездоганно.',
    benefitNames: ['Досвідчені майстри', 'Преміальний сервіс', 'Якісна косметика', 'Атмосфера', 'Індивідуальний підхід'],
    benefitDetails: ['Увага до кожної деталі', 'Комфорт у кожному візиті', 'Професійний догляд', 'Класика та сучасність', 'Стиль, створений для тебе'],
    moreTeam: 'Переглянути всю команду',
    moreServices: 'Переглянути послуги',
    moreProducts: 'Усі товари',
    emptyReviews: 'Відгуки з’являться тут після публікації.',
    emptyProducts: 'Каталог товарів наразі наповнюється.',
    questionCopy: 'Зв’яжись із нами, і ми допоможемо обрати зручний час та послугу.',
    socialCopy: 'Слідкуй за новинами, акціями та життям барбершопу.',
    phone: 'Зателефонувати',
    booking: 'Записатися онлайн',
    noBarbers: 'Інформацію про майстрів незабаром буде додано.',
    noLocations: 'Адреси закладів незабаром будуть доступні.',
    noServices: 'Перелік послуг наразі наповнюється.',
    services: 'ПОСЛУГИ',
  } : {
    benefits: 'WHY CHOOSE US',
    team: 'OUR BARBERS',
    reviews: 'CLIENT REVIEWS',
    products: 'TOP PRODUCTS',
    findUs: 'FIND US',
    questions: 'HAVE A QUESTION?',
    social: 'FOLLOW US',
    intro: 'We combine barbering traditions with modern service so you always look your best.',
    benefitNames: ['Experienced barbers', 'Premium service', 'Quality grooming', 'Atmosphere', 'Personal approach'],
    benefitDetails: ['Attention to every detail', 'Comfort in every visit', 'Professional care', 'Tradition meets modern comfort', 'Style made for you'],
    moreTeam: 'Meet our barbers',
    moreServices: 'Explore services',
    moreProducts: 'All products',
    emptyReviews: 'Customer reviews will appear once published.',
    emptyProducts: 'The product catalog is being prepared.',
    questionCopy: 'Contact us and we will help you choose a service and time.',
    socialCopy: 'Follow our news, offers and barbershop life.',
    phone: 'Call us',
    booking: 'Book online',
    noBarbers: 'Barber profiles will be available soon.',
    noLocations: 'Shop locations will be available soon.',
    noServices: 'Our service list is being prepared.',
    services: 'SERVICES',
  }

  return <main id="top" className="landing home-landing">
    <SiteHeader locale={locale} messages={t} />
    <HeroSlider locale={locale} />

    <section id="about" className="home-section home-section--benefits" aria-labelledby="benefits-title">
      <div className="home-container">
        <h2 id="benefits-title" className="home-section__heading">{labels.benefits}</h2>
        <p className="home-section__intro">{labels.intro}</p>
        <div className="home-benefits">
          {labels.benefitNames.map((name, index) => <article className="home-benefit" key={name}>
            <BenefitIcon index={index} />
            <h3>{name}</h3>
            <p>{labels.benefitDetails[index]}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section id="team" className="home-section" aria-labelledby="team-title">
      <div className="home-container">
        <div className="home-section__heading-row">
          <h2 id="team-title" className="home-section__heading">{labels.team}</h2>
          <Link href={`/${locale}/catalog`} className="home-section__more">{labels.moreTeam} →</Link>
        </div>
        {barbers.docs.length ? <div className="home-team-grid">
          {barbers.docs.slice(0, 4).map(barber => <article className="home-team-card" key={barber.id}>
            {barber.portrait && typeof barber.portrait === 'object' && barber.portrait.url
              ? <img className="home-team-card__portrait" src={barber.portrait.url} alt={barber.portrait.alt || barber.name} loading="lazy" />
              : <div className="home-team-card__placeholder" aria-hidden="true">{barber.name.slice(0, 1).toUpperCase()}</div>}
            <div className="home-team-card__caption">
              <h3>{barber.name}</h3>
              {localizedCopy(barber, 'localizedBio', 'bio') && <p>{localizedCopy(barber, 'localizedBio', 'bio')}</p>}
            </div>
          </article>)}
        </div> : <p className="home-section__empty">{labels.noBarbers}</p>}
      </div>
    </section>

    <section id="reviews" className="home-section home-section--muted" aria-labelledby="reviews-title">
      <div className="home-container">
        <h2 id="reviews-title" className="home-section__heading">{labels.reviews}</h2>
        <p className="home-section__empty">{labels.emptyReviews}</p>
      </div>
    </section>

    <section id="products" className="home-section" aria-labelledby="products-title">
      <div className="home-container">
        <div className="home-section__heading-row">
          <h2 id="products-title" className="home-section__heading">{labels.products}</h2>
          <Link href={`/${locale}/catalog`} className="home-section__more">{labels.moreProducts} →</Link>
        </div>
        <p className="home-section__empty">{labels.emptyProducts}</p>
      </div>
    </section>

    <section id="services" className="home-section home-section--muted" aria-labelledby="services-title">
      <div className="home-container">
        <div className="home-section__heading-row">
          <h2 id="services-title" className="home-section__heading">{labels.services}</h2>
          <Link href={`/${locale}/catalog`} className="home-section__more">{labels.moreServices} →</Link>
        </div>
        {services.docs.length ? <div className="home-services-grid">
          {services.docs.slice(0, 4).map(service => <article className="home-service-card" key={service.id}>
            <h3>{service.name}</h3>
            <p>{localizedCopy(service, 'localizedDescription', 'description')}</p>
            <div><span>{service.durationMinutes} {t.common.minutes}</span><strong>{service.price} {t.common.currency}</strong></div>
          </article>)}
        </div> : <p className="home-section__empty">{labels.noServices}</p>}
      </div>
    </section>

    <section id="locations" className="home-section" aria-labelledby="locations-title">
      <div className="home-container">
        <h2 id="locations-title" className="home-section__heading">{labels.findUs}</h2>
        <div className="home-location-layout">
          <div className="home-location-layout__art" aria-hidden="true"><span className="home-location-layout__compass">✦</span></div>
          <div className="home-location-list">
            {locations.docs.length ? locations.docs.map(location => <address key={location.id}>
              <h3>{location.name}</h3>
              <p>{location.city}, {location.address}</p>
              {location.phone && <a href={`tel:${location.phone.replace(/[^+\d]/g, '')}`}>{location.phone}</a>}
            </address>) : <p className="home-section__empty">{labels.noLocations}</p>}
          </div>
        </div>
      </div>
    </section>

    <section id="questions" className="home-section home-section--questions" aria-labelledby="questions-title">
      <div className="home-container">
        <h2 id="questions-title" className="home-section__heading">{labels.questions}</h2>
        <p className="home-section__intro">{labels.questionCopy}</p>
        <div className="home-question-actions">
          {locations.docs[0]?.phone && <a className="home-question-actions__outline" href={`tel:${locations.docs[0].phone.replace(/[^+\d]/g, '')}`}>{labels.phone}</a>}
          <Link className="home-question-actions__primary" href={`/${locale}/booking`}>{labels.booking} →</Link>
        </div>
      </div>
    </section>

    <section id="social" className="home-section home-section--social">
      <div className="home-container">
        <h2 className="home-section__heading">{labels.social}</h2>
        <p className="home-section__intro">{labels.socialCopy}</p>
      </div>
    </section>

    <footer className="home-footer">
      <div className="home-container home-footer__layout">
        <p>GENTLEMEN’S BARBERSHOP</p>
        <nav aria-label={t.nav.primary}>
          <Link href={`/${locale}/#about`}>{labels.benefits}</Link>
          <Link href={`/${locale}/#team`}>{labels.team}</Link>
          <Link href={`/${locale}/#locations`}>{labels.findUs}</Link>
        </nav>
      </div>
      <div className="home-container home-footer__bottom">© 2026 GENTLEMEN’S BARBERSHOP</div>
    </footer>
  </main>
}
