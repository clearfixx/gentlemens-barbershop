import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { CalendarDays, ChevronRight, CircleUserRound, Star } from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { SiteHeader } from '@/components/site-header'
import { getOwnBookingHistory } from '@/lib/booking/get-own-booking-history'
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

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const session = await payload.auth({ headers: await headers() })
  const user = session.user
  if (!user) redirect(`/${locale}/auth`)
  if (user.role !== 'customer' && user.role !== 'admin') notFound()

  const page = await getOwnBookingHistory(
    payload,
    { id: Number(user.id), role: user.role },
    { limit: 10 },
  )
  const displayName = typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim()
    : user.email
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
            <a href="#profile" className="account-sidebar__item is-current"><CircleUserRound size={19} />{uk ? 'Профіль' : 'Profile'}</a>
            <a href="#appointments" className="account-sidebar__item"><CalendarDays size={19} />{uk ? 'Мої записи' : 'My bookings'}</a>
          </nav>
          <Link className="account-sidebar__booking" href={`/${locale}/booking`}>{uk ? 'Записатися' : 'Book a visit'} <ChevronRight size={16} /></Link>
        </aside>
        <div className="account-content">
          <section id="profile" className="account-panel" aria-labelledby="account-profile-heading">
            <p className="account-kicker">{uk ? 'ОСОБИСТИЙ КАБІНЕТ' : 'MY ACCOUNT'}</p>
            <h1 id="account-profile-heading">{uk ? 'Профіль' : 'Profile'}</h1>
            <div className="account-identity">
              <span className="account-identity__avatar" aria-hidden="true"><CircleUserRound size={42} strokeWidth={1.1} /></span>
              <div>
                <h2>{displayName}</h2>
                <p>{user.email}</p>
                <span className="account-subtle">{uk ? 'Персональні дані та історія відвідувань' : 'Personal details and visit history'}</span>
              </div>
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
            {page.bookings.length === 0 ? (
              <div className="account-empty">
                <CalendarDays size={30} strokeWidth={1.25} />
                <p>{uk ? 'У вас поки немає записів.' : 'You have no bookings yet.'}</p>
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
                    <span className={`account-status account-status--${booking.status}`}>{statusLabels[locale][booking.status]}</span>
                  </li>
                ))}
              </ul>
            )}
            {page.hasNextPage && <p className="account-note">{uk ? 'Показано останні 10 записів. Повна історія буде доступна в окремому розділі.' : 'Showing the latest 10 bookings. The full history will be available in a dedicated view.'}</p>}
          </section>

          <section className="account-panel account-panel--preview" aria-label={uk ? 'Відгуки' : 'Reviews'}>
            <Star size={23} strokeWidth={1.4} aria-hidden="true" />
            <div><h2>{uk ? 'Ваші відгуки' : 'Your reviews'}</h2><p>{uk ? 'Оцінювання завершених візитів з’явиться в наступному пакеті.' : 'Reviews for completed visits will be added in a later package.'}</p></div>
          </section>
        </div>
      </div>
    </main>
  )
}
