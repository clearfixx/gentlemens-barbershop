import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { notFound, redirect } from 'next/navigation'
import { ClipboardCheck, LayoutDashboard, CalendarDays, Scissors, ShieldAlert, Settings2 } from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { loadPortfolioHoldQueue, type HoldQueueFilters } from '@/lib/admin/portfolio-hold-queue'
import '../approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Справи щодо фотографій | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}

const stages = ['open', 'untriaged', 'investigating', 'awaiting_information',
  'escalated', 'closed_administratively'] as const

export default async function PortfolioCasesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<HoldQueueFilters>
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
  let queue: Awaited<ReturnType<typeof loadPortfolioHoldQueue>>
  try {
    queue = await loadPortfolioHoldQueue(payload, {
      id: scope.userId, role: scope.role,
    }, await searchParams)
  } catch (error) {
    if (error instanceof RangeError) notFound()
    throw error
  }
  const stageNames: Record<string, string> = uk
    ? { open: 'Незавершені', untriaged: 'Не розподілено', investigating: 'Розслідується',
      awaiting_information: 'Очікує інформації', escalated: 'Передано на перевірку',
      closed_administratively: 'Адміністративно закрито' }
    : { open: 'Open', untriaged: 'Untriaged', investigating: 'Investigating',
      awaiting_information: 'Awaiting information', escalated: 'Escalated',
      closed_administratively: 'Administratively closed' }
  const base = `/${locale}/management/portfolio-cases`
  const pageUrl = (page: number) => {
    const query = new URLSearchParams({ stage: queue.stage, page: String(page) })
    if (queue.locationId !== null) query.set('location', String(queue.locationId))
    if (queue.assigneeId !== null) query.set('assignee', String(queue.assigneeId))
    return `${base}?${query.toString()}`
  }
  const date = new Intl.DateTimeFormat(uk ? 'uk-UA' : 'en-GB', {
    dateStyle: 'medium', timeZone: 'Europe/Kyiv',
  })
  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Адміністративна навігація' : 'Management navigation'}>
      <Link href={`/${locale}/management`} className="management-brand">GENTLEMEN’S <span>BARBERSHOP</span></Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} className="management-sidebar__item"><LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Overview'}</Link>
      <Link href={`/${locale}/management/bookings`} className="management-sidebar__item"><CalendarDays size={17}/>{uk ? 'Бронювання' : 'Bookings'}</Link>
      <Link href={`/${locale}/management/barbers`} className="management-sidebar__item"><Scissors size={17}/>{uk ? 'Барбери' : 'Barbers'}</Link>
      <Link href={`/${locale}/management/professional-reviews`} className="management-sidebar__item"><ClipboardCheck size={17}/>{uk ? 'Погодження контенту' : 'Content reviews'}</Link>
      <Link href={base} aria-current="page" className="management-sidebar__item management-sidebar__item--active"><ShieldAlert size={17}/>{uk ? 'Справи щодо фото' : 'Photo cases'}</Link>
      <div className="management-sidebar__bottom"><Settings2 size={17}/>{scope.role === 'admin' ? (uk ? 'Адміністратор мережі' : 'Network administrator') : (uk ? 'Керівник закладу' : 'Location manager')}</div>
    </aside>
    <div className="management-workspace">
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'МОДЕРАЦІЯ МЕДІА' : 'MEDIA MODERATION'}</p>
        <div className="management-heading">
          <div>
            <h1>{uk ? 'Звернення щодо фотографій' : 'Photo concern cases'}</h1>
            <p>{uk ? 'Запобіжні блокування залишаються чинними навіть після адміністративного закриття справи.' :
              'Precautionary photo holds remain in effect after administrative case closure.'}</p>
          </div>
          <span className="management-scope">{uk ? 'Справ' : 'Cases'}: {queue.total}</span>
        </div>
        <section className="management-panel" aria-labelledby="photo-cases-filters">
          <h2 id="photo-cases-filters" className="management-booking-filters-title">{uk ? 'Фільтри справ' : 'Case filters'}</h2>
          <form method="get" action={base} className="management-case-filters">
            <label>{uk ? 'Етап' : 'Stage'}
              <select name="stage" defaultValue={queue.stage}>
                {stages.map(stage => <option key={stage} value={stage}>{stageNames[stage]}</option>)}
              </select>
            </label>
            <label>{uk ? 'ID закладу' : 'Location ID'}
              <input type="number" min="1" step="1" name="location"
                defaultValue={queue.locationId ?? ''} placeholder={uk ? 'Усі доступні' : 'All accessible'}/>
            </label>
            <label>{uk ? 'ID відповідального' : 'Assigned admin ID'}
              <input type="number" min="1" step="1" name="assignee"
                defaultValue={queue.assigneeId ?? ''} placeholder={uk ? 'Усі' : 'All'}/>
            </label>
            <button type="submit">{uk ? 'Застосувати' : 'Apply'}</button>
            <Link href={base} className="management-booking-reset">{uk ? 'Скинути' : 'Reset'}</Link>
          </form>
          <p className="management-booking-note">{uk
            ? 'Позначка «Потребує уваги» означає понад 7 днів без активності у відкритій справі. Це робочий індикатор, а не юридичний строк.'
            : '“Needs follow-up” means over seven days without activity on an open case. It is an operational indicator, not a legal deadline.'}</p>
        </section>
        <section className="management-panel management-booking-results" aria-labelledby="photo-cases-results">
          <div className="management-panel__heading">
            <h2 id="photo-cases-results">{stageNames[queue.stage]}</h2>
            <span>{uk ? 'Сторінка' : 'Page'} {queue.page} / {Math.max(1, queue.totalPages)}</span>
          </div>
          {queue.rows.length ? <div className="management-booking-table-wrap">
            <table className="management-booking-table">
              <thead><tr>
                <th scope="col">{uk ? 'Справа' : 'Case'}</th>
                <th scope="col">{uk ? 'Заклад' : 'Location'}</th>
                <th scope="col">{uk ? 'Майстер' : 'Barber'}</th>
                <th scope="col">{uk ? 'Етап' : 'Stage'}</th>
                <th scope="col">{uk ? 'Відповідальний' : 'Assignee'}</th>
                <th scope="col">{uk ? 'Остання активність' : 'Last activity'}</th>
                <th scope="col">{uk ? 'Увага' : 'Attention'}</th>
              </tr></thead>
              <tbody>{queue.rows.map(row => <tr key={row.holdId}>
                <td><Link className="management-review-link" href={`/${locale}/management/professional-reviews/${row.revisionId}`}>#{row.holdId}</Link></td>
                <td>#{row.locationId}</td>
                <td>#{row.barberId}</td>
                <td>{stageNames[row.stage]}</td>
                <td>{row.assignedAdminId === null ? '—' : `#${row.assignedAdminId}`}</td>
                <td><time dateTime={row.lastActivityAt}>{date.format(new Date(row.lastActivityAt))}</time></td>
                <td>{row.needsFollowup ? <span className="management-case-attention">
                  {uk ? 'Потребує уваги' : 'Needs follow-up'}
                </span> : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="management-empty">{uk ? 'За цими фільтрами справ немає.' : 'No cases match these filters.'}</p>}
          <nav className="management-booking-pages" aria-label={uk ? 'Сторінки справ' : 'Case pages'}>
            {queue.page > 1 ? <Link href={pageUrl(queue.page - 1)}>{uk ? 'Попередня' : 'Previous'}</Link> :
              <span aria-disabled="true">{uk ? 'Попередня' : 'Previous'}</span>}
            {queue.page < queue.totalPages ? <Link href={pageUrl(queue.page + 1)}>{uk ? 'Наступна' : 'Next'}</Link> :
              <span aria-disabled="true">{uk ? 'Наступна' : 'Next'}</span>}
          </nav>
        </section>
      </div>
    </div>
  </main>
}
