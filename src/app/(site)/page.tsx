import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const [services, barbers, locations] = await Promise.all([
    payload.find({ collection: 'services', depth: 0, limit: 30, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'barbers', depth: 1, limit: 30, sort: 'name', overrideAccess: false }),
    payload.find({ collection: 'locations', depth: 0, limit: 30, sort: 'name', overrideAccess: false }),
  ])
  return <main id="top" className="landing">
    <SiteHeader />
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">Традиції. Майстерність. Стиль.</p>
        <h1 id="hero-title">МІСЦЕ, ДЕ<br/>НАРОДЖУЄТЬСЯ<br/><em>СТИЛЬ.</em></h1>
        <p>Чоловічий догляд із характером. Класична майстерність, увага до деталей і атмосфера, до якої хочеться повертатися.</p>
        <div className="hero-actions"><a className="cta" href="#booking">Записатися</a><a href="#about">Дізнатися більше ↗</a></div>
      </div>
      <div className="hero-art" role="img" aria-label="Декоративна заглушка для фотографії барбершопу"><span>✦<small>GENTLEMEN’S BARBERSHOP</small></span></div>
      <a className="scroll-hint" href="#about" aria-label="Перейти до наступної секції">↓</a>
    </section>
    <section id="about" className="content-section"><p className="eyebrow">Чому обирають нас</p><h2>БІЛЬШЕ, НІЖ СТРИЖКА</h2><p>Майстерність, атмосфера та увага до деталей.</p></section>
    <section id="services" className="content-section alt"><p className="eyebrow">Традиції догляду</p><h2>НАШІ ПОСЛУГИ</h2>{services.docs.length ? <ul className="catalog-grid service-grid">{services.docs.map(service => <li className="catalog-card" key={service.id}><div className="catalog-card__top"><h3>{service.name}</h3><span className="catalog-card__price">{service.price} грн</span></div>{service.description && <p>{service.description}</p>}<div className="catalog-card__meta"><span>{service.durationMinutes} хвилин</span><span aria-hidden="true">✦</span></div></li>)}</ul> : <p>Послуги незабаром з’являться.</p>}<p><a className="catalog-inline-link" href="/catalog">Переглянути весь каталог →</a></p></section>
    <section id="team" className="content-section"><p className="eyebrow">Майстри</p><h2>НАША КОМАНДА</h2>{barbers.docs.length ? <ul className="catalog-grid team-grid">{barbers.docs.map(barber => <li className="catalog-card team-card" key={barber.id}>{barber.portrait && typeof barber.portrait === 'object' && barber.portrait.url ? <img className="team-card__portrait" src={barber.portrait.url} alt={barber.portrait.alt || `Портрет майстра ${barber.name}`} loading="lazy" /> : <div className="team-card__monogram" aria-hidden="true">{barber.name.slice(0, 1).toLocaleUpperCase('uk')}</div>}<h3>{barber.name}</h3>{barber.bio && <p>{barber.bio}</p>}</li>)}</ul> : <p>Знайомство з командою — незабаром.</p>}<p><a className="catalog-inline-link" href="/catalog">Усі майстри →</a></p></section>
    <section id="locations" className="content-section alt"><p className="eyebrow">Локації</p><h2>ЯК НАС ЗНАЙТИ</h2>{locations.docs.length ? <ul className="catalog-grid location-grid">{locations.docs.map(location => <li className="catalog-card location-card" key={location.id}><span className="catalog-card__kicker">{location.city}</span><h3>{location.name}</h3><address>{location.address}</address>{location.phone && <a href={`tel:${location.phone.replace(/[^+\\d]/g, '')}`}>{location.phone}</a>}{location.description && <p>{location.description}</p>}</li>)}</ul> : <p>Адреси наших філій незабаром з’являться.</p>}</section>
    <section id="booking" className="content-section"><p className="eyebrow">Ваш візит</p><h2>ОНЛАЙН-ЗАПИС</h2><p>Сервіс бронювання перебуває в розробці.</p></section>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
