import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { loadPublicCatalog, parseCatalogId } from '@/lib/catalog/public-catalog'

export const dynamic = 'force-dynamic'

type Params = Promise<{ location?: string; barber?: string }>

export default async function CatalogPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const locationId = parseCatalogId(params.location)
  const barberId = parseCatalogId(params.barber)
  const payload = await getPayload({ config })
  const catalog = await loadPublicCatalog(payload, { locationId, barberId })
  const visibleLocationIds = new Set(catalog.locations.map(location => location.id))
  const selectedLocation = catalog.locations.find(location => location.id === locationId)
  const selectedBarber = catalog.barbers.find(barber => barber.id === barberId)

  return <main id="top" className="landing">
    <SiteHeader />
    <div className="catalog-page">
      <Link className="catalog-back" href="/">← На головну</Link>
      <p className="eyebrow">Gentlemen’s Barbershop</p>
      <h1>ОБЕРІТЬ СВІЙ СТИЛЬ</h1>
      <p className="catalog-intro">Познайомтеся з нашими майстрами, послугами та локаціями. Ціни й інформація надходять безпосередньо з каталогу барбершопу.</p>
      <form className="catalog-filters" method="get" action="/catalog">
        <label>Локація
          <select name="location" defaultValue={selectedLocation?.id ?? ''}>
            <option value="">Усі локації</option>
            {catalog.locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.city}</option>)}
          </select>
        </label>
        <label>Майстер
          <select name="barber" defaultValue={selectedBarber?.id ?? ''}>
            <option value="">Усі майстри</option>
            {catalog.barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
        </label>
        <button className="cta" type="submit">Показати</button>
        <Link className="catalog-reset" href="/catalog">Скинути</Link>
      </form>
      <section aria-labelledby="catalog-services">
        <h2 id="catalog-services">Послуги</h2>
        {catalog.services.length ? <ul className="catalog-grid">{catalog.services.map(service => <li className="catalog-card" key={service.id}>
          <div className="catalog-card__top"><h3>{service.name}</h3><strong className="catalog-card__price">від {service.price} грн</strong></div>
          {service.description && <p>{service.description}</p>}
          <div className="catalog-card__meta"><span>{service.durationMinutes} хв</span><span aria-hidden="true">✦</span></div>
        </li>)}</ul> : <p className="catalog-empty">Для обраних фільтрів послуг немає.</p>}
      </section>
      <section aria-labelledby="catalog-team">
        <h2 id="catalog-team">Наші майстри</h2>
        {catalog.barbers.length ? <ul className="catalog-grid">{catalog.barbers.map(barber => <li className="catalog-card team-card" key={barber.id}>
          {barber.portrait && typeof barber.portrait === 'object' && barber.portrait.url
            ? <img className="team-card__portrait" src={barber.portrait.url} alt={barber.portrait.alt || `Портрет майстра ${barber.name}`} loading="lazy" />
            : <span className="team-card__monogram" aria-hidden="true">{barber.name.charAt(0)}</span>}
          <h3>{barber.name}</h3>{barber.bio && <p>{barber.bio}</p>}
          <span className="catalog-card__kicker">{catalog.locations.find(location => location.id === (typeof barber.location === 'number' ? barber.location : barber.location.id))?.name}</span>
        </li>)}</ul> : <p className="catalog-empty">Наразі немає доступних майстрів для цього вибору.</p>}
      </section>
      <section aria-labelledby="catalog-locations">
        <h2 id="catalog-locations">Локації</h2>
        <ul className="catalog-grid">{catalog.locations.filter(location => visibleLocationIds.has(location.id) && (!locationId || location.id === locationId)).map(location => <li className="catalog-card location-card" key={location.id}>
          <span className="catalog-card__kicker">{location.city}</span>
          <h3>{location.name}</h3><address>{location.address}</address>
          {location.phone && <a href={`tel:${location.phone.replace(/[^+0-9]/g, '')}`}>{location.phone}</a>}
        </li>)}</ul>
      </section>
      <p className="catalog-notice">Онлайн-бронювання ще готується до запуску. Каталог доступний для ознайомлення.</p>
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
