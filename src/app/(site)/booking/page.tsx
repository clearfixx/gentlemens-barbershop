import { getPayload } from 'payload'
import config from '@/payload.config'
import { SiteHeader } from '@/components/site-header'
import { BookingWizard } from '@/components/booking-wizard'
import { loadPublicCatalog } from '@/lib/catalog/public-catalog'

export const dynamic = 'force-dynamic'

export default async function BookingPage() {
  const payload = await getPayload({ config })
  const catalog = await loadPublicCatalog(payload)
  const locations = catalog.locations.map(item => ({ id: item.id, name: item.name, city: item.city }))
  const services = catalog.services.map(item => ({ id: item.id, name: item.name }))
  const barbers = catalog.barbers.map(item => ({
    id: item.id,
    name: item.name,
    locationId: typeof item.location === 'number' ? item.location : item.location.id,
    serviceIds: (item.serviceOfferings ?? []).map(offering => typeof offering.service === 'number' ? offering.service : offering.service.id),
  }))
  return <main className="landing">
    <SiteHeader />
    <div className="catalog-page">
      <p className="eyebrow">Gentlemen’s Barbershop</p>
      <h1>СПЛАНУЙТЕ ВІЗИТ</h1>
      <p className="catalog-intro">Оберіть локацію, майстра та послугу, щоб переглянути вільний час. Поки що це попередній перегляд без створення запису.</p>
      <BookingWizard locations={locations} barbers={barbers} services={services} />
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
