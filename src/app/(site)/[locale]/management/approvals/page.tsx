import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { Bell, CalendarDays, ClipboardCheck, LayoutDashboard, MapPin, Scissors, Settings2, UsersRound } from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { ApprovalDecisionActions } from '@/components/admin/approval-decision-actions'
import { TariffProposalForm, type TariffOfferingOption } from '@/components/admin/tariff-proposal-form'
import './management.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Погодження | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}

type Status = 'pending' | 'approved' | 'rejected'
const allowedStatuses: readonly Status[] = ['pending', 'approved', 'rejected']
function refId(value: number | { id: number } | null | undefined): number | null {
  return typeof value === 'number' ? value : value?.id ?? null
}
function valueText(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні'
  return '—'
}

export default async function ApprovalsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const session = await payload.auth({ headers: await headers() })
  if (!session.user) redirect(`/${locale}/auth`)
  if (session.user.role !== 'admin' && session.user.role !== 'location_admin') notFound()
  const scope = await resolveLocationScope(payload, {
    id: Number(session.user.id), role: session.user.role,
  }).catch(() => null)
  if (!scope) notFound()

  const query = await searchParams
  const requested = allowedStatuses.includes(query.status as Status) ? query.status as Status : 'pending'
  const filters: Array<Record<string, { equals?: number | string; in?: number[] }>> = [
    { status: { equals: requested } },
  ]
  if (scope.role !== 'admin') {
    filters.push({ createdBy: { equals: scope.userId } })
    filters.push({ location: { in: scope.locationIds } })
  }
  const [requests, locations, services, barbers] = await Promise.all([
    payload.find({
      collection: 'commercial-change-requests',
      overrideAccess: true, depth: 0, sort: '-createdAt', limit: 40,
      where: { and: filters },
    }),
    payload.find({
      collection: 'locations', overrideAccess: true, depth: 0, limit: 100,
      where: scope.role === 'admin' ? {} : { id: { in: scope.locationIds } },
    }),
    payload.find({ collection: 'services', overrideAccess: true, depth: 0, limit: 100 }),
    payload.find({
      collection: 'barbers', overrideAccess: true, depth: 0, limit: 100,
      ...(scope.role === 'admin' ? {} : { where: { location: { in: scope.locationIds } } }),
    }),
  ])
  const locationNames = new Map(locations.docs.map(item => [Number(item.id), item.name]))
  const serviceNames = new Map(services.docs.map(item => [Number(item.id), item.name]))
  const barberNames = new Map(barbers.docs.map(item => [Number(item.id), item.name]))
  const offeringOptions: TariffOfferingOption[] = barbers.docs.flatMap(barber => {
    const locationId = refId(barber.location)
    if (!locationId || (scope.role !== 'admin' && !scope.locationIds.includes(locationId))) return []
    const offerings = (barber.serviceOfferings ?? []) as Array<{ service: number | { id: number } }>
    return offerings.flatMap(offering => {
      const serviceId = refId(offering.service)
      if (!serviceId || !serviceNames.has(serviceId)) return []
      return [{
        locationId, barberId: Number(barber.id), serviceId,
        label: `${barber.name} · ${serviceNames.get(serviceId)} · ${locationNames.get(locationId) ?? ''}`,
      }]
    })
  })
  const labels = {
    pending: uk ? 'Очікують' : 'Pending',
    approved: uk ? 'Схвалені' : 'Approved',
    rejected: uk ? 'Відхилені' : 'Rejected',
  }
  const types: Record<string, string> = uk
    ? { barber_price: 'Ціна майстра', barber_duration: 'Тривалість майстра',
        service_price: 'Ціна послуги', service_duration: 'Тривалість послуги',
        service_assignment: 'Набір послуг' }
    : { barber_price: 'Barber price', barber_duration: 'Barber duration',
        service_price: 'Service price', service_duration: 'Service duration',
        service_assignment: 'Service assignment' }

  return <main className="management-shell">
    <aside className="management-sidebar" aria-label={uk ? 'Адміністративна навігація' : 'Management navigation'}>
      <Link href={`/${locale}/management/approvals`} className="management-brand">GENTLEMEN’S <span>BARBERSHOP</span></Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link href={`/${locale}/management`} className="management-sidebar__item"><LayoutDashboard size={17}/>{uk ? 'Огляд мережі' : 'Network overview'}</Link>
      <Link href={`/${locale}/management/bookings`} className="management-sidebar__item"><CalendarDays size={17}/>{uk ? 'Бронювання' : 'Bookings'}</Link>
      <div className="management-sidebar__item"><MapPin size={17}/>{uk ? 'Заклади' : 'Locations'}</div>
      <Link href={`/${locale}/management/barbers`} className="management-sidebar__item"><Scissors size={17}/>{uk ? 'Барбери' : 'Barbers'}</Link>
      <div className="management-sidebar__item"><UsersRound size={17}/>{uk ? 'Клієнти' : 'Customers'}</div>
      <Link className="management-sidebar__item management-sidebar__item--active"
        href={`/${locale}/management/approvals`} aria-current="page">
        <ClipboardCheck size={17}/>{uk ? 'Погодження' : 'Approvals'}
      </Link>
      <div className="management-sidebar__bottom"><Settings2 size={17}/>
        {scope.role === 'admin' ? (uk ? 'Адміністратор мережі' : 'Network administrator')
          : (uk ? 'Адміністратор закладу' : 'Location manager')}
      </div>
    </aside>
    <div className="management-workspace">
      <header className="management-topbar">
        <span>{uk ? 'Панель керування' : 'Management panel'}</span>
        <div><Bell size={18} aria-hidden="true"/><span>{session.user.email}</span></div>
      </header>
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
        <div className="management-heading">
          <div><h1>{scope.role === 'admin' ? (uk ? 'Погодження змін' : 'Change approvals')
              : (uk ? 'Мої заявки' : 'My requests')}</h1>
            <p>{uk ? 'Контроль тарифів і змін послуг у мережі.' : 'Review proposed commercial changes across locations.'}</p>
          </div>
          <span className="management-scope">{scope.role === 'admin'
            ? (uk ? 'Уся мережа' : 'All locations')
            : (uk ? `Закладів: ${scope.locationIds.length}` : `Locations: ${scope.locationIds.length}`)}</span>
        </div>
        {scope.role === 'location_admin' && <TariffProposalForm locale={locale} offerings={offeringOptions}/>}
        <nav className="management-tabs" aria-label={uk ? 'Фільтр статусу' : 'Status filter'}>
          {allowedStatuses.map(status => <Link key={status}
            href={`/${locale}/management/approvals?status=${status}`}
            aria-current={status === requested ? 'page' : undefined}
            className={status === requested ? 'management-tab management-tab--active' : 'management-tab'}>
            {labels[status]}
          </Link>)}
        </nav>
        <section className="management-panel" aria-labelledby="requests-heading">
          <div className="management-panel__heading">
            <h2 id="requests-heading">{labels[requested]}</h2>
            <span>{requests.docs.length}{requests.hasNextPage ? '+' : ''}</span>
          </div>
          {requests.docs.length === 0
            ? <p className="management-empty">{uk ? 'Заявок із таким статусом немає.' : 'No requests with this status.'}</p>
            : <div className="management-requests">
              {requests.docs.map(item => {
                const itemId = Number(item.id)
                const kind = String(item.kind)
                const canDecide = scope.role === 'admin' && item.status === 'pending' &&
                  (kind === 'barber_price' || kind === 'barber_duration')
                return <article className="management-request" key={item.id}>
                  <div className="management-request__top">
                    <span className="management-request__number">#{item.id}</span>
                    <span className={`management-status management-status--${item.status}`}>{labels[item.status as Status] ?? String(item.status)}</span>
                  </div>
                  <h3>{types[kind] ?? kind} · {serviceNames.get(refId(item.service) ?? 0) ?? (uk ? 'Послуга' : 'Service')}</h3>
                  <p>{locationNames.get(refId(item.location) ?? 0) ?? (uk ? 'Заклад' : 'Location')}
                    {item.barber ? ` · ${barberNames.get(refId(item.barber) ?? 0) ?? (uk ? 'Майстер' : 'Barber')}` : ''}</p>
                  <div className="management-request__values">
                    <span>{uk ? 'Було' : 'Previous'}: <strong>{valueText(item.oldValue)}</strong></span>
                    <span aria-hidden="true">→</span>
                    <span>{uk ? 'Запропоновано' : 'Proposed'}: <strong>{valueText(item.proposedValue)}</strong></span>
                  </div>
                  {item.decisionReason && <p>{uk ? 'Коментар: ' : 'Comment: '}{item.decisionReason}</p>}
                  {canDecide && <ApprovalDecisionActions id={itemId} locale={locale}/>}
                </article>
              })}
            </div>}
          {requests.hasNextPage && <p className="management-empty">
            {uk ? 'Показано останні 40 заявок. Пагінація буде додана наступним пакетом.'
              : 'Showing the latest 40 requests. Pagination is planned.'}
          </p>}
        </section>
      </div>
    </div>
  </main>
}
