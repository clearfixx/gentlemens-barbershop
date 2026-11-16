import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { Bell, ClipboardCheck, LayoutDashboard, Scissors, CalendarDays, Settings2 } from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { loadProfessionalReviewQueue } from '@/lib/admin/professional-review-queue'
import '../approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Професійний контент — Погодження | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}
const statuses = ['pending', 'approved', 'rejected'] as const

export default async function ProfessionalReviewsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`/${locale}/auth`)
  if (user.role !== 'admin' && user.role !== 'location_admin') notFound()
  const scope = await resolveLocationScope(payload, { id: Number(user.id), role: user.role }).catch(() => null)
  if (!scope) notFound()
  const filters = await searchParams
  let queue: Awaited<ReturnType<typeof loadProfessionalReviewQueue>>
  try {
    queue = await loadProfessionalReviewQueue(payload, scope, filters)
  } catch (error) {
    if (error instanceof RangeError || (error instanceof Error && /forbidden|assigned location/.test(error.message))) {
      notFound()
    }
    throw error
  }
  const labels: Record<string, string> = uk
    ? { pending: 'Очікують', approved: 'Схвалені', rejected: 'Відхилені' }
    : { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
  const barberIds = [...new Set(queue.rows.map(item => item.barberId))]
  const barbers = barberIds.length ? await payload.find({
    collection: 'barbers', overrideAccess: true, depth: 0, limit: 20,
    where: { id: { in: barberIds } },
  }) : null
  const names = new Map(barbers?.docs.map(item => [Number(item.id), item.name]) ?? [])
  const base = `/${locale}/management/professional-reviews`
  const pageUrl = (page: number) => `${base}?status=${queue.status}&page=${page}`
  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Адміністративна навігація' : 'Management navigation'}>
      <Link href={`/${locale}/management`} className="management-brand">GENTLEMEN’S <span>BARBERSHOP</span></Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} className="management-sidebar__item"><LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Overview'}</Link>
      <Link href={`/${locale}/management/bookings`} className="management-sidebar__item"><CalendarDays size={17}/>{uk ? 'Бронювання' : 'Bookings'}</Link>
      <Link href={`/${locale}/management/barbers`} className="management-sidebar__item"><Scissors size={17}/>{uk ? 'Барбери' : 'Barbers'}</Link>
      <Link href={`/${locale}/management/approvals`} className="management-sidebar__item"><ClipboardCheck size={17}/>{uk ? 'Тарифи' : 'Tariff approvals'}</Link>
      <Link href={base} aria-current="page" className="management-sidebar__item management-sidebar__item--active"><ClipboardCheck size={17}/>{uk ? 'Контент' : 'Content approvals'}</Link>
      <div className="management-sidebar__bottom"><Settings2 size={17}/>{scope.role === 'admin' ? (uk ? 'Адміністратор мережі' : 'Network admin') : (uk ? 'Керівник закладу' : 'Location manager')}</div>
    </aside>
    <div className="management-workspace">
      <header className="management-topbar"><span>{uk ? 'Панель керування' : 'Management panel'}</span><div><Bell size={18}/><span>{user.email}</span></div></header>
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'ПРОФЕСІЙНИЙ КОНТЕНТ' : 'PROFESSIONAL CONTENT'}</p>
        <div className="management-heading">
          <div><h1>{uk ? 'Погодження контенту' : 'Content reviews'}</h1>
            <p>{uk ? 'Окрема черга змін біографій, портфоліо, сертифікатів і соцпосилань.' : 'Review queue for biographies, portfolios, qualifications and social links.'}</p></div>
          <span className="management-scope">{uk ? 'Заявок' : 'Requests'}: {queue.totalDocs}</span>
        </div>
        <nav className="management-tabs" aria-label={uk ? 'Фільтр статусів' : 'Status filter'}>
          {statuses.map(status => <Link key={status} href={`${base}?status=${status}`}
            aria-current={status === queue.status ? 'page' : undefined}
            className={status === queue.status ? 'management-tab management-tab--active' : 'management-tab'}>
            {labels[status]}
          </Link>)}
        </nav>
        <section className="management-panel" aria-labelledby="professional-reviews-heading">
          <div className="management-panel__heading">
            <h2 id="professional-reviews-heading">{labels[queue.status]}</h2>
            <span>{uk ? 'Сторінка' : 'Page'} {queue.page} / {Math.max(1, queue.totalPages)}</span>
          </div>
          {queue.rows.length ? <div className="management-booking-table-wrap"><table className="management-booking-table">
            <thead><tr>
              <th scope="col">ID</th><th scope="col">{uk ? 'Майстер' : 'Barber'}</th>
              <th scope="col">{uk ? 'Заклад' : 'Location'}</th>
              <th scope="col">{uk ? 'Статус' : 'Status'}</th>
              <th scope="col">{uk ? 'Створено' : 'Created'}</th>
            </tr></thead>
            <tbody>{queue.rows.map(item => <tr key={item.id}>
              <td>#{item.id}</td><td>{names.get(item.barberId) ?? `#${item.barberId}`}</td>
              <td>#{item.locationId}</td>
              <td><span className={`management-status management-status--${item.status}`}>{labels[item.status] ?? item.status}</span></td>
              <td><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(uk ? 'uk-UA' : 'en-GB', {
                dateStyle: 'medium', timeZone: 'Europe/Kyiv',
              }).format(new Date(item.createdAt))}</time></td>
            </tr>)}</tbody>
          </table></div> : <p className="management-empty">{uk ? 'Заявок поки немає.' : 'No reviews yet.'}</p>}
          <nav className="management-booking-pages" aria-label={uk ? 'Сторінки заявок' : 'Review pages'}>
            {queue.page > 1 ? <Link href={pageUrl(queue.page - 1)}>{uk ? 'Попередня' : 'Previous'}</Link> : <span aria-disabled="true">{uk ? 'Попередня' : 'Previous'}</span>}
            {queue.hasNextPage ? <Link href={pageUrl(queue.page + 1)}>{uk ? 'Наступна' : 'Next'}</Link> : <span aria-disabled="true">{uk ? 'Наступна' : 'Next'}</span>}
          </nav>
        </section>
        <p className="management-booking-note">{uk
          ? 'Перегляд diff і кнопки схвалення залишаються вимкненими до перевірки транзакційного застосування ревізій та повного аудиту.'
          : 'Diff review and approval actions remain disabled until transactional publication and audit are verified.'}</p>
      </div>
    </div>
  </main>
}
