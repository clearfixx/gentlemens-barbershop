import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { loadPublicCatalog, parseCatalogId } from '@/lib/catalog/public-catalog'
import { parseAvailabilityInput } from '@/lib/catalog/public-availability'
import { getPublicAvailability } from '@/lib/catalog/get-public-availability'

export const dynamic = 'force-dynamic'

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ barber?: string; service?: string; date?: string }>
}) {
  const params = await searchParams
  const payload = await getPayload({ config })
  const catalog = await loadPublicCatalog(payload)
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
    <SiteHeader />
    <div className="catalog-page">
      <Link href="/catalog" className="catalog-back">← До каталогу</Link>
      <p className="eyebrow">Планування візиту</p>
      <h1>ВІЛЬНИЙ ЧАС</h1>
      <p className="catalog-intro">Перегляньте доступні години для майстра й послуги. Це попередня інформація, а не підтвердження запису.</p>
      <form method="get" action="/availability" className="catalog-filters">
        <label>Майстер
          <select name="barber" required defaultValue={parseCatalogId(params.barber) ?? ''}>
            <option value="">Оберіть майстра</option>
            {catalog.barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
        </label>
        <label>Послуга
          <select name="service" required defaultValue={parseCatalogId(params.service) ?? ''}>
            <option value="">Оберіть послугу</option>
            {catalog.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label>Дата
          <input type="date" name="date" required defaultValue={params.date ?? ''} />
        </label>
        <button className="cta" type="submit">Перевірити час</button>
      </form>
      {invalid && <p role="alert" className="catalog-empty">Оберіть коректну дату в межах найближчого місяця.</p>}
      {!invalid && (params.barber || params.service || params.date) && !result && <p className="catalog-empty">Майстер або послуга недоступні для вибору.</p>}
      {result && <section aria-labelledby="slots-title">
        <h2 id="slots-title">Доступні години · {result.date}</h2>
        <p className="catalog-intro">Тривалість: {result.durationMinutes} хв · Вартість: {result.price} грн</p>
        {result.slots.length ? <ul className="availability-slots">
          {result.slots.map(slot => <li key={slot.startsAt}><time dateTime={slot.startsAt}>
            {new Intl.DateTimeFormat('uk-UA', { timeZone: result.timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(slot.startsAt))}
          </time></li>)}
        </ul> : <p className="catalog-empty">На обрану дату вільних годин немає.</p>}
        <p className="catalog-notice">Бронювання ще не відкрите. Вільний час може змінитися.</p>
      </section>}
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
