import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import {
  Bell, CalendarDays, CheckCheck, ClipboardCheck, Clock3,
  LayoutDashboard, MapPin, Scissors, Settings2, Star, TrendingUp, UsersRound,
} from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { loadManagementDashboard, resolveDashboardLocations } from '@/lib/admin/management-dashboard'
import './approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Панель керування | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}

export default async function ManagementPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ location?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!auth.user) redirect(`/${locale}/auth`)
  if (auth.user.role !== 'admin' && auth.user.role !== 'location_admin') notFound()
  const scope = await resolveLocationScope(payload, {
    id: Number(auth.user.id), role: auth.user.role,
  }).catch(() => null)
  if (!scope) notFound()

  const query = await searchParams
  let selected: number[] | null
  try {
    selected = resolveDashboardLocations(scope, query.location)
  } catch {
    notFound()
  }

  const [locations, dashboard] = await Promise.all([
    payload.find({
      collection: 'locations', overrideAccess: true, depth: 0, limit: 100,
      ...(scope.role !== 'admin' ? { where: { id: { in: scope.locationIds } } } : {}),
      sort: 'name',
    }),
    loadManagementDashboard(payload, selected),
  ])
  const names = new Map(locations.docs.map(item => [Number(item.id), item.name]))
  const cards = [
    { id: 'bookings', icon: CalendarDays, label: uk ? 'Записів сьогодні' : 'Bookings today',
      value: dashboard.metrics.bookingsToday.toLocaleString(uk ? 'uk-UA' : 'en-GB') },
    { id: 'pending', icon: Clock3, label: uk ? 'Очікують підтвердження' : 'Awaiting confirmation',
      value: dashboard.metrics.awaitingConfirmation.toLocaleString(uk ? 'uk-UA' : 'en-GB') },
    { id: 'done', icon: CheckCheck, label: uk ? 'Завершено сьогодні' : 'Completed today',
      value: dashboard.metrics.completedToday.toLocaleString(uk ? 'uk-UA' : 'en-GB') },
    { id: 'revenue', icon: TrendingUp, label: uk ? 'Дохід за завершеними візитами сьогодні' : 'Revenue from completed visits today',
      value: `${dashboard.metrics.revenueTodayUAH.toLocaleString(uk ? 'uk-UA' : 'en-GB')} ₴` },
  ]
  const statuses: Record<string, string> = uk ? {
    pending: 'Очікує', confirmed: 'Підтверджено', completed: 'Завершено',
    cancelled: 'Скасовано', no_show: 'Неявка',
  } : {
    pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed',
    cancelled: 'Cancelled', no_show: 'No-show',
  }
  const dateFmt = new Intl.DateTimeFormat(uk ? 'uk-UA' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv',
  })

  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Адміністративна навігація' : 'Management navigation'}>
      <Link href={`/${locale}/management`} className="management-brand">GENTLEMEN’S <span>BARBERSHOP</span></Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} aria-current="page"
        className="management-sidebar__item management-sidebar__item--active">
        <LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Network overview'}
      </Link>
      <div className="management-sidebar__item"><MapPin size={17}/>{uk ? 'Заклади' : 'Locations'}</div>
      <div className="management-sidebar__item"><Scissors size={17}/>{uk ? 'Барбери й послуги' : 'Barbers and services'}</div>
      <div className="management-sidebar__item"><UsersRound size={17}/>{uk ? 'Клієнти' : 'Customers'}</div>
      <Link className="management-sidebar__item" href={`/${locale}/management/approvals`}>
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
        <div><Bell size={18} aria-hidden="true"/><span>{auth.user.email}</span></div>
      </header>
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'ОГЛЯД' : 'OVERVIEW'}</p>
        <div className="management-heading">
          <div><h1>{scope.role === 'admin'
            ? (uk ? 'Огляд мережі' : 'Network overview')
            : (uk ? 'Огляд закладів' : 'Location overview')}</h1>
            <p>{uk ? 'Ключові показники та остання активність.' : 'Key metrics and recent activity.'}</p>
          </div>
          <form className="management-location-filter" action={`/${locale}/management`} method="get">
            <label htmlFor="management-location">{uk ? 'Заклад' : 'Location'}</label>
            <select id="management-location" name="location" defaultValue={query.location ?? ''}>
              <option value="">{scope.role === 'admin'
                ? (uk ? 'Уся мережа' : 'Entire network')
                : (uk ? 'Мої заклади' : 'My locations')}</option>
              {locations.docs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="submit">{uk ? 'Застосувати' : 'Apply'}</button>
          </form>
        </div>
        <div className="management-kpi-grid">
          {cards.map(card => <section key={card.id} className="management-kpi">
            <div className="management-kpi__icon"><card.icon size={21}/></div>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </section>)}
        </div>
        <div className="management-dashboard-grid">
          <section className="management-panel" aria-labelledby="management-recent-heading">
            <div className="management-panel__heading">
              <h2 id="management-recent-heading">{uk ? 'Останні бронювання' : 'Recent bookings'}</h2>
              <span>{dashboard.recentBookings.length}</span>
            </div>
            {dashboard.recentBookings.length ? <div className="management-booking-table-wrap">
              <table className="management-booking-table">
                <thead><tr>
                  <th scope="col">{uk ? 'Клієнт' : 'Customer'}</th>
                  <th scope="col">{uk ? 'Дата' : 'Date'}</th>
                  <th scope="col">{uk ? 'Заклад' : 'Location'}</th>
                  <th scope="col">{uk ? 'Статус' : 'Status'}</th>
                  <th scope="col">{uk ? 'Вартість' : 'Price'}</th>
                </tr></thead>
                <tbody>{dashboard.recentBookings.map(item => <tr key={item.id}>
                  <td>{item.customerName}</td>
                  <td><time dateTime={item.startsAt}>{dateFmt.format(new Date(item.startsAt))}</time></td>
                  <td>{names.get(item.locationId) ?? `#${item.locationId}`}</td>
                  <td><span className={`management-status management-status--${item.status}`}>
                    {statuses[item.status] ?? item.status}
                  </span></td>
                  <td>{item.price.toLocaleString(uk ? 'uk-UA' : 'en-GB')} ₴</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="management-empty">{uk ? 'Бронювань поки немає.' : 'No bookings yet.'}</p>}
          </section>
          <section className="management-panel" aria-labelledby="management-attention-heading">
            <div className="management-panel__heading">
              <h2 id="management-attention-heading">{uk ? 'Потребує уваги' : 'Needs attention'}</h2>
            </div>
            <div className="management-attention-item">
              <ClipboardCheck size={19}/>
              <span>{uk ? 'Заявки на погодження' : 'Pending approvals'}</span>
              <strong>{dashboard.metrics.pendingApprovals}</strong>
            </div>
            <div className="management-attention-item">
              <CalendarDays size={19}/>
              <span>{uk ? 'Непідтверджені записи' : 'Unconfirmed bookings'}</span>
              <strong>{dashboard.metrics.awaitingConfirmation}</strong>
            </div>
            <div className="management-attention-item">
              <Star size={19}/>
              <span>{uk ? 'Відгуки на модерації' : 'Reviews awaiting moderation'}</span>
              <strong>{dashboard.metrics.pendingReviews}</strong>
            </div>
            <Link href={`/${locale}/management/approvals`} className="management-attention-link">
              {uk ? 'Перейти до погоджень' : 'Review approvals'} →
            </Link>
          </section>
        </div>
      </div>
    </div>
  </main>
}
