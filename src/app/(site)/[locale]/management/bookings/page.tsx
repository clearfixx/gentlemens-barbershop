import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import {
  Bell, CalendarDays, ClipboardCheck, LayoutDashboard, MapPin,
  Scissors, Settings2, UsersRound,
} from 'lucide-react'
import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { getOperationalBookings } from '@/lib/admin/operational-bookings'
import '../approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Бронювання | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}
const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const

export default async function ManagementBookingsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    location?: string
    status?: string
    date?: string
    page?: string
  }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`/${locale}/auth`)
  if (user.role !== 'admin' && user.role !== 'location_admin') notFound()
  const scope = await resolveLocationScope(payload, {
    id: Number(user.id), role: user.role,
  }).catch(() => null)
  if (!scope) notFound()
  const filters = await searchParams
  let bookings: Awaited<ReturnType<typeof getOperationalBookings>>
  try {
    bookings = await getOperationalBookings(payload, scope, filters)
  } catch (error) {
    // Do not mislabel database errors as invalid user filters.
    if (error instanceof RangeError || (error instanceof Error &&
        /forbidden|assigned locations|Invalid dashboard location/.test(error.message))) {
      notFound()
    }
    throw error
  }
  const locations = await payload.find({
    collection: 'locations', overrideAccess: true, depth: 0,
    sort: 'name', limit: 100,
    ...(scope.role === 'admin' ? {} : { where: { id: { in: scope.locationIds } } }),
  })
  const barbers = await payload.find({
    collection: 'barbers', overrideAccess: true, depth: 0,
    limit: 200,
    ...(scope.role === 'admin' ? {} : { where: { location: { in: scope.locationIds } } }),
  })
  const locationNames = new Map(locations.docs.map(item => [Number(item.id), item.name]))
  const barberNames = new Map(barbers.docs.map(item => [Number(item.id), item.name]))
  const statusLabel: Record<string, string> = uk
    ? { pending: 'Очікує', confirmed: 'Підтверджено', completed: 'Завершено',
        cancelled: 'Скасовано', no_show: 'Неявка' }
    : { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed',
        cancelled: 'Cancelled', no_show: 'No show' }
  const base = `/${locale}/management/bookings`
  const queryFor = (page: number) => {
    const params = new URLSearchParams()
    if (filters.location) params.set('location', filters.location)
    if (filters.status) params.set('status', filters.status)
    if (filters.date) params.set('date', filters.date)
    params.set('page', String(page))
    return `${base}?${params.toString()}`
  }
  const dateFmt = new Intl.DateTimeFormat(uk ? 'uk-UA' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv',
  })
  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Навігація керування' : 'Management navigation'}>
      <Link href={`/${locale}/management`} className="management-brand">GENTLEMEN’S <span>BARBERSHOP</span></Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} className="management-sidebar__item">
        <LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Network overview'}
      </Link>
      <Link href={base} aria-current="page"
        className="management-sidebar__item management-sidebar__item--active">
        <CalendarDays size={17}/>{uk ? 'Бронювання' : 'Bookings'}
      </Link>
      <div className="management-sidebar__item"><MapPin size={17}/>{uk ? 'Заклади' : 'Locations'}</div>
      <div className="management-sidebar__item"><Scissors size={17}/>{uk ? 'Барбери й послуги' : 'Barbers and services'}</div>
      <div className="management-sidebar__item"><UsersRound size={17}/>{uk ? 'Клієнти' : 'Customers'}</div>
      <Link href={`/${locale}/management/approvals`} className="management-sidebar__item">
        <ClipboardCheck size={17}/>{scope.role === 'admin'
          ? (uk ? 'Погодження' : 'Approvals') : (uk ? 'Мої заявки' : 'My requests')}
      </Link>
      <div className="management-sidebar__bottom"><Settings2 size={17}/>
        {scope.role === 'admin' ? (uk ? 'Адміністратор мережі' : 'Network administrator')
          : (uk ? 'Адміністратор закладу' : 'Location manager')}
      </div>
    </aside>
    <div className="management-workspace">
      <header className="management-topbar">
        <span>{uk ? 'Панель керування' : 'Management panel'}</span>
        <div><Bell size={18} aria-hidden="true"/><span>{user.email}</span></div>
      </header>
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'БРОНЮВАННЯ' : 'BOOKINGS'}</p>
        <div className="management-heading">
          <div>
            <h1>{uk ? 'Керування записами' : 'Booking management'}</h1>
            <p>{uk ? 'Пошук і перегляд записів ваших закладів.' : 'Browse appointments at your locations.'}</p>
          </div>
          <span className="management-scope">{uk ? 'Усього' : 'Total'}: {bookings.totalDocs}</span>
        </div>
        <section className="management-panel" aria-labelledby="management-booking-filters">
          <h2 id="management-booking-filters" className="management-booking-filters-title">
            {uk ? 'Фільтри' : 'Filters'}
          </h2>
          <form action={base} method="get" className="management-booking-filters">
            <label>{uk ? 'Заклад' : 'Location'}
              <select name="location" defaultValue={filters.location ?? ''}>
                <option value="">{uk ? 'Усі доступні' : 'All permitted'}</option>
                {locations.docs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>{uk ? 'Статус' : 'Status'}
              <select name="status" defaultValue={filters.status ?? ''}>
                <option value="">{uk ? 'Усі статуси' : 'All statuses'}</option>
                {statuses.map(status => <option key={status} value={status}>{statusLabel[status]}</option>)}
              </select>
            </label>
            <label>{uk ? 'Дата (UTC)' : 'Date (UTC)'}
              <input type="date" name="date" defaultValue={filters.date ?? ''}/>
            </label>
            <button type="submit">{uk ? 'Застосувати' : 'Apply'}</button>
            <Link href={base} className="management-booking-reset">{uk ? 'Скинути' : 'Reset'}</Link>
          </form>
        </section>
        <section className="management-panel management-booking-results" aria-labelledby="management-bookings-heading">
          <div className="management-panel__heading">
            <h2 id="management-bookings-heading">{uk ? 'Список записів' : 'Appointments'}</h2>
            <span>{uk ? 'Сторінка' : 'Page'} {bookings.page} / {Math.max(1, bookings.totalPages)}</span>
          </div>
          {bookings.bookings.length ? <div className="management-booking-table-wrap">
            <table className="management-booking-table">
              <thead><tr>
                <th scope="col">ID</th>
                <th scope="col">{uk ? 'Клієнт' : 'Customer'}</th>
                <th scope="col">{uk ? 'Дата і час' : 'Date and time'}</th>
                <th scope="col">{uk ? 'Заклад' : 'Location'}</th>
                <th scope="col">{uk ? 'Майстер' : 'Barber'}</th>
                <th scope="col">{uk ? 'Статус' : 'Status'}</th>
                <th scope="col">{uk ? 'Сума' : 'Amount'}</th>
              </tr></thead>
              <tbody>{bookings.bookings.map(item => <tr key={item.id}>
                <td>#{item.id}</td>
                <td>{item.customerName}</td>
                <td><time dateTime={item.startsAt}>{dateFmt.format(new Date(item.startsAt))}</time></td>
                <td>{locationNames.get(item.locationId) ?? `#${item.locationId}`}</td>
                <td>{barberNames.get(item.barberId) ?? `#${item.barberId}`}</td>
                <td><span className={`management-status management-status--${item.status}`}>
                  {statusLabel[item.status]}</span></td>
                <td>{item.totalPrice.toLocaleString(uk ? 'uk-UA' : 'en-GB')} ₴</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="management-empty">{uk ? 'За цими фільтрами записів не знайдено.' : 'No matching bookings.'}</p>}
          <nav className="management-booking-pages" aria-label={uk ? 'Сторінки записів' : 'Booking pages'}>
            {bookings.page > 1
              ? <Link href={queryFor(bookings.page - 1)}>{uk ? 'Попередня' : 'Previous'}</Link>
              : <span aria-disabled="true">{uk ? 'Попередня' : 'Previous'}</span>}
            {bookings.hasNextPage
              ? <Link href={queryFor(bookings.page + 1)}>{uk ? 'Наступна' : 'Next'}</Link>
              : <span aria-disabled="true">{uk ? 'Наступна' : 'Next'}</span>}
          </nav>
        </section>
        <p className="management-booking-note">
          {uk ? 'Зміна статусів записів поки недоступна в production до завершення захищеного сценарію запису.'
            : 'Booking status mutations remain disabled in production until guarded write rollout.'}
        </p>
      </div>
    </div>
  </main>
}
