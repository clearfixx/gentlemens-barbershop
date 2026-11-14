import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { CalendarDays, ChevronRight, CircleUserRound, LayoutDashboard, Star, Clock3, ShieldCheck } from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { SiteHeader } from '@/components/site-header'
import { getOwnBookingHistory, type BookingHistoryFilter } from '@/lib/booking/get-own-booking-history'
import { AccountProfileName } from '@/components/account-profile-name'
import { AccountBookingCancel } from '@/components/account-booking-cancel'
import { bookingWritesEnabled } from '@/lib/booking/booking-write-guard'
import './account.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'en' ? 'My account | Gentlemen’s Barbershop' : 'Особистий кабінет | Gentlemen’s Barbershop',
    robots: { index: false, follow: false },
  }
}

const statusLabels = {
  uk: { pending: 'Очікує підтвердження', confirmed: 'Підтверджено', completed: 'Завершено', cancelled: 'Скасовано', no_show: 'Неявка' },
  en: { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No show' },
} as const

export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const session = await payload.auth({ headers: await headers() })
  const user = session.user
  if (!user) redirect(`/${locale}/auth`)
  if (user.role !== 'customer' && user.role !== 'admin') notFound()

  const query = await searchParams
  const filter: BookingHistoryFilter = query.filter === 'upcoming' || query.filter === 'past'
    ? query.filter : 'all'
  const requestedPage = typeof query.page === 'string' && /^[1-9][0-9]{0,2}$/.test(query.page)
    ? Number(query.page) : 1
  const history = await getOwnBookingHistory(
    payload,
    { id: Number(user.id), role: user.role },
    { limit: 10, page: requestedPage, filter },
  )
  const pageNumber = Math.min(requestedPage, Math.max(1, history.totalPages))
  const page = pageNumber === requestedPage ? history : await getOwnBookingHistory(
    payload, { id: Number(user.id), role: user.role },
    { limit: 10, page: pageNumber, filter },
  )
  const accountUrl = (nextFilter: BookingHistoryFilter, nextPage = 1) =>
    `/${locale}/account?filter=${nextFilter}&page=${nextPage}#appointments`

  const displayName = typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim()
    : (typeof user.email === 'string' ? user.email : '')
  const canCancel = bookingWritesEnabled(process.env)
  const upcoming = await getOwnBookingHistory(payload, { id: Number(user.id), role: user.role }, {
    filter: 'upcoming', activeOnly: true, ascending: true, limit: 1,
  })
  const nextBooking = upcoming.bookings[0]
  const dateLocale = uk ? 'uk-UA' : 'en-GB'
  const dateFormat = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' })
  const timeFormat = new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' })

  return (
    <main className="landing account-page">
      <SiteHeader locale={locale} />
      <div className="account-shell">
        <aside className="account-sidebar" aria-label={uk ? 'Навігація кабінету' : 'Account navigation'}>
          <p className="account-sidebar__title">GENTLEMEN’S</p>
          <nav>
            <a href="#overview" className="account-sidebar__item is-current"><LayoutDashboard size={19} />{uk ? 'Огляд' : 'Overview'}</a>
            <a href="#appointments" className="account-sidebar__item"><CalendarDays size={19} />{uk ? 'Мої записи' : 'My bookings'}</a>
            <a href="#profile" className="account-sidebar__item"><CircleUserRound size={19} />{uk ? 'Профіль' : 'Profile'}</a>
            <a href="#reviews" className="account-sidebar__item"><Star size={19} />{uk ? 'Відгуки' : 'Reviews'}</a>
          </nav>
          <Link className="account-sidebar__booking" href={`/${locale}/booking`}>{uk ? 'Записатися' : 'Book a visit'} <ChevronRight size={16} /></Link>
        </aside>
        <div className="account-content">
          <section id="overview" className="account-welcome" aria-labelledby="account-welcome-title">
            <div>
              <p className="account-kicker">{uk ? 'ВАШ ПРОСТІР' : 'YOUR SPACE'}</p>
              <h1 id="account-welcome-title">{uk ? 'Вітаємо!' : 'Welcome back!'}</h1>
              <p>{uk ? 'Керуйте своїми записами та персональними даними.' : 'Manage your bookings and personal details.'}</p>
            </div>
            <Link className="account-primary-action" href={`/${locale}/booking`}><CalendarDays size={19} />{uk ? 'Новий запис' : 'New booking'}</Link>
          </section>
          <section className="account-next" aria-label={uk ? 'Наступний візит' : 'Next visit'}>
            <div className="account-next__heading">
              <p className="account-kicker">{uk ? 'ВАШ НАСТУПНИЙ ВІЗИТ' : 'YOUR NEXT VISIT'}</p>
              <Clock3 size={23} aria-hidden="true" />
            </div>
            {nextBooking ? <>
              <h2>{dateFormat.format(new Date(nextBooking.startsAt))} · {timeFormat.format(new Date(nextBooking.startsAt))}</h2>
              <p>{uk ? `Запис №${nextBooking.id}` : `Booking #${nextBooking.id}`} · {statusLabels[locale][nextBooking.status]}</p>
              <div className="account-next__actions">
                <a href="#appointments">{uk ? 'Переглянути історію' : 'View bookings'} <ChevronRight size={15} /></a>
                {canCancel && <AccountBookingCancel id={nextBooking.id} locale={locale} />}
              </div>
            </> : <>
              <h2>{uk ? 'Майбутніх записів немає' : 'No upcoming visits'}</h2>
              <p>{uk ? 'Оберіть зручний час для наступного візиту.' : 'Choose a convenient time for your next visit.'}</p>
              <Link href={`/${locale}/booking`}>{uk ? 'Обрати час' : 'Choose a time'} <ChevronRight size={15} /></Link>
            </>}
          </section>
          <section id="profile" className="account-panel" aria-labelledby="account-profile-heading">
            <p className="account-kicker">{uk ? 'ОСОБИСТИЙ КАБІНЕТ' : 'MY ACCOUNT'}</p>
            <h1 id="account-profile-heading">{uk ? 'Профіль' : 'Profile'}</h1>
            <div className="account-identity">
              <span className="account-identity__avatar" aria-hidden="true"><CircleUserRound size={42} strokeWidth={1.1} /></span>
              <AccountProfileName initialName={displayName} initialPhone={'phone' in user && typeof user.phone === 'string' ? user.phone : ''} email={typeof user.email === 'string' ? user.email : ''} userId={Number(user.id)} locale={locale} />
            </div>
          </section>

          <section id="appointments" className="account-panel" aria-labelledby="account-bookings-heading">
            <div className="account-heading">
              <div>
                <p className="account-kicker">{uk ? 'ВАШІ ВІЗИТИ' : 'YOUR VISITS'}</p>
                <h2 id="account-bookings-heading">{uk ? 'Історія записів' : 'Booking history'}</h2>
              </div>
              <Link href={`/${locale}/booking`} className="account-text-link">{uk ? 'Новий запис' : 'New booking'} <ChevronRight size={16} /></Link>
            </div>
            <nav className="account-filters" aria-label={uk ? 'Фільтр записів' : 'Booking filter'}>
              {(['all', 'upcoming', 'past'] as const).map(option =>
                <Link key={option} href={accountUrl(option)} aria-current={filter === option ? 'page' : undefined}
                  className={filter === option ? 'is-active' : undefined}>
                  {option === 'all' ? (uk ? 'Усі' : 'All') : option === 'upcoming' ? (uk ? 'Майбутні' : 'Upcoming') : (uk ? 'Минулі' : 'Past')}
                </Link>
              )}
            </nav>
            {page.bookings.length === 0 ? (
              <div className="account-empty">
                <CalendarDays size={30} strokeWidth={1.25} />
                <p>{filter === 'upcoming' ? (uk ? 'Майбутніх записів немає.' : 'No upcoming bookings.') : filter === 'past' ? (uk ? 'Минулих записів немає.' : 'No past bookings.') : (uk ? 'У вас поки немає записів.' : 'You have no bookings yet.')}</p>
                <Link href={`/${locale}/booking`}>{uk ? 'Обрати час' : 'Find a time'}</Link>
              </div>
            ) : (
              <ul className="account-booking-list">
                {page.bookings.map(booking => (
                  <li key={booking.id} className="account-booking">
                    <div className="account-booking__date">
                      <CalendarDays size={19} aria-hidden="true" />
                      <time dateTime={booking.startsAt}>{dateFormat.format(new Date(booking.startsAt))}</time>
                      <strong>{timeFormat.format(new Date(booking.startsAt))}</strong>
                    </div>
                    <div className="account-booking__info">
                      <strong>{uk ? `Запис №${booking.id}` : `Booking #${booking.id}`}</strong>
                      <span>{uk ? `Послуг: ${booking.serviceIds.length}` : `Services: ${booking.serviceIds.length}`}</span>
                    </div>
                    <div className="account-booking__actions">
                      <span className={`account-status account-status--${booking.status}`}>{statusLabels[locale][booking.status]}</span>
                      {canCancel && (booking.status === 'pending' || booking.status === 'confirmed') && <AccountBookingCancel id={booking.id} locale={locale} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {page.totalPages > 1 && <nav className="account-pagination" aria-label={uk ? 'Сторінки історії' : 'Booking history pages'}>
              {pageNumber > 1
                ? <Link href={accountUrl(filter, pageNumber - 1)}>{uk ? '← Назад' : '← Previous'}</Link>
                : <span aria-disabled="true">{uk ? '← Назад' : '← Previous'}</span>}
              <span>{uk ? `Сторінка ${pageNumber} із ${page.totalPages}` : `Page ${pageNumber} of ${page.totalPages}`}</span>
              {page.hasNextPage
                ? <Link href={accountUrl(filter, pageNumber + 1)}>{uk ? 'Далі →' : 'Next →'}</Link>
                : <span aria-disabled="true">{uk ? 'Далі →' : 'Next →'}</span>}
            </nav>}
          </section>

          <section id="reviews" className="account-panel account-panel--preview" aria-label={uk ? 'Відгуки' : 'Reviews'}>
            <Star size={23} strokeWidth={1.4} aria-hidden="true" />
            <div><h2>{uk ? 'Ваші відгуки' : 'Your reviews'}</h2><p>{uk ? 'Оцінювання завершених візитів з’явиться в наступному пакеті.' : 'Reviews for completed visits will be added in a later package.'}</p></div>
          </section>
          <p className="account-privacy-note"><ShieldCheck size={16} aria-hidden="true" /> {uk ? 'Дані кабінету доступні лише у вашій авторизованій сесії.' : 'Your account data is available only in your authenticated session.'}</p>
        </div>
      </div>
    </main>
  )
}
