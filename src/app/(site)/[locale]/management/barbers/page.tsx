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
import { loadBarberAdminDirectory } from '@/lib/admin/barber-directory'
import '../approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Барбери | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}

export default async function ManagementBarbersPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ location?: string; search?: string; page?: string }>
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
  let directory: Awaited<ReturnType<typeof loadBarberAdminDirectory>>
  try {
    directory = await loadBarberAdminDirectory(payload, scope, filters)
  } catch (error) {
    if (error instanceof RangeError || (error instanceof Error &&
        /forbidden|assigned locations|Invalid dashboard location/.test(error.message))) {
      notFound()
    }
    throw error
  }
  const locations = await payload.find({
    collection: 'locations', overrideAccess: true, depth: 0,
    limit: 100, sort: 'name',
    ...(scope.role === 'admin' ? {} : { where: { id: { in: scope.locationIds } } }),
  })
  const names = new Map(locations.docs.map(item => [Number(item.id), item.name]))
  const base = `/${locale}/management/barbers`
  const queryFor = (page: number) => {
    const params = new URLSearchParams()
    if (filters.location) params.set('location', filters.location)
    if (filters.search) params.set('search', filters.search)
    params.set('page', String(page))
    return `${base}?${params.toString()}`
  }

  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Навігація керування' : 'Management navigation'}>
      <Link href={`/${locale}/management`} className="management-brand">
        GENTLEMEN’S <span>BARBERSHOP</span>
      </Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} className="management-sidebar__item">
        <LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Network overview'}
      </Link>
      <Link href={`/${locale}/management/bookings`} className="management-sidebar__item">
        <CalendarDays size={17}/>{uk ? 'Бронювання' : 'Bookings'}
      </Link>
      <div className="management-sidebar__item"><MapPin size={17}/>{uk ? 'Заклади' : 'Locations'}</div>
      <Link href={base} className="management-sidebar__item management-sidebar__item--active" aria-current="page">
        <Scissors size={17}/>{uk ? 'Барбери' : 'Barbers'}
      </Link>
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
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'ПЕРСОНАЛ' : 'STAFF'}</p>
        <div className="management-heading">
          <div>
            <h1>{uk ? 'Барбери мережі' : 'Barber directory'}</h1>
            <p>{uk
              ? 'Майстри, прив’язки до закладів і готовність професійних профілів.'
              : 'Staff locations and professional profile completeness.'}</p>
          </div>
          <span className="management-scope">{uk ? 'Усього' : 'Total'}: {directory.totalDocs}</span>
        </div>
        <section className="management-panel" aria-labelledby="barber-directory-filters">
          <h2 className="management-booking-filters-title" id="barber-directory-filters">
            {uk ? 'Фільтри' : 'Filters'}
          </h2>
          <form action={base} method="get" className="management-booking-filters">
            <label>{uk ? 'Заклад' : 'Location'}
              <select name="location" defaultValue={filters.location ?? ''}>
                <option value="">{uk ? 'Усі доступні' : 'All permitted'}</option>
                {locations.docs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>{uk ? 'Пошук за ім’ям' : 'Search by name'}
              <input name="search" maxLength={80} defaultValue={filters.search ?? ''}/>
            </label>
            <button type="submit">{uk ? 'Показати' : 'Apply'}</button>
            <Link href={base} className="management-booking-reset">{uk ? 'Скинути' : 'Reset'}</Link>
          </form>
        </section>
        <section className="management-panel management-booking-results" aria-labelledby="barber-directory-title">
          <div className="management-panel__heading">
            <h2 id="barber-directory-title">{uk ? 'Команда' : 'Team'}</h2>
            <span>{uk ? 'Сторінка' : 'Page'} {directory.page} / {Math.max(1, directory.totalPages)}</span>
          </div>
          {directory.rows.length ? <div className="management-booking-table-wrap">
            <table className="management-booking-table">
              <thead><tr>
                <th scope="col">{uk ? 'Майстер' : 'Barber'}</th>
                <th scope="col">{uk ? 'Заклад' : 'Location'}</th>
                <th scope="col">{uk ? 'Статус' : 'Status'}</th>
                <th scope="col">{uk ? 'Послуги' : 'Services'}</th>
                <th scope="col">{uk ? 'Кабінет' : 'Account'}</th>
                <th scope="col">{uk ? 'Профіль' : 'Profile'}</th>
              </tr></thead>
              <tbody>{directory.rows.map(row => <tr key={row.id}>
                <td><strong>{row.name}</strong><span className="management-directory-slug">{row.slug}</span></td>
                <td>{names.get(row.locationId) ?? `#${row.locationId}`}</td>
                <td><span className={`management-status ${row.active ? 'management-status--approved' : 'management-status--rejected'}`}>
                  {row.active ? (uk ? 'Активний' : 'Active') : (uk ? 'Неактивний' : 'Inactive')}
                </span></td>
                <td>{row.offeringCount}</td>
                <td>{row.linkedAccount ? (uk ? 'Прив’язано' : 'Linked') : (uk ? 'Не прив’язано' : 'Unlinked')}</td>
                <td>{row.hasPortrait && row.hasBiography
                  ? (uk ? 'Основні дані є' : 'Basic details present')
                  : (uk ? 'Потрібне наповнення' : 'Needs content')}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="management-empty">
            {uk ? 'Майстрів за цими фільтрами не знайдено.' : 'No matching barbers.'}
          </p>}
          <nav className="management-booking-pages" aria-label={uk ? 'Сторінки майстрів' : 'Barber pages'}>
            {directory.page > 1
              ? <Link href={queryFor(directory.page - 1)}>{uk ? 'Попередня' : 'Previous'}</Link>
              : <span aria-disabled="true">{uk ? 'Попередня' : 'Previous'}</span>}
            {directory.hasNextPage
              ? <Link href={queryFor(directory.page + 1)}>{uk ? 'Наступна' : 'Next'}</Link>
              : <span aria-disabled="true">{uk ? 'Наступна' : 'Next'}</span>}
          </nav>
        </section>
        <p className="management-booking-note">
          {uk
            ? 'Професійні чернетки, портфоліо та кваліфікації підключимо через окремий процес погодження. Зараз ці поля не публікуються автоматично.'
            : 'Professional drafts, portfolios and qualifications will use a separate approval process. Nothing is published automatically.'}
        </p>
      </div>
    </div>
  </main>
}
