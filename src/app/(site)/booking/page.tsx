import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { BookingWizard } from '@/components/booking-wizard'
import { loadPublicCatalog } from '@/lib/catalog/public-catalog'

export const dynamic = 'force-dynamic'

export default async function BookingPage() {
  const payload = await getPayload({ config })
  const catalog = await loadPublicCatalog(payload)
  const locations = catalog.locations.map(item => ({ id: Number(item.id), name: String(item.name), city: String(item.city) }))
  const services = catalog.services.map(item => ({ id: Number(item.id), name: String(item.name) }))
  const barbers = catalog.barbers.map(item => ({
    id: Number(item.id),
    name: String(item.name),
    locationId: typeof item.location === 'number' ? item.location : Number(item.location.id),
    serviceIds: (item.serviceOfferings ?? []).map((offering: { service: number | { id: number | string } }) => typeof offering.service === 'number' ? offering.service : Number(offering.service.id)),
  }))
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const maxDate = new Date(now + 30 * 86400000).toISOString().slice(0, 10)
  return <main className="landing">
    <SiteHeader />
    <div className="catalog-page">
      <p className="eyebrow">Gentlemen’s Barbershop</p>
      <h1>СПЛАНУЙТЕ ВІЗИТ</h1>
      <p className="catalog-intro">Оберіть локацію, майстра та послугу, щоб переглянути вільний час. Поки що це попередній перегляд без створення запису.</p>
      <BookingWizard locations={locations} barbers={barbers} services={services} today={today} maxDate={maxDate} />
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
