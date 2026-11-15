import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import {
  Bell, CalendarDays, ChevronRight, CircleUserRound, Clock3, Crown,
  Gift, Heart, Mail, MapPin, Scissors, Settings2, ShieldCheck, Star,
} from 'lucide-react'

import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { SiteHeader } from '@/components/site-header'
import { getOwnBookingHistory, type BookingHistoryFilter } from '@/lib/booking/get-own-booking-history'
import { AccountProfileName } from '@/components/account-profile-name'
import { AccountAvatar } from '@/components/account-avatar'
import { AccountBookingCancel } from '@/components/account-booking-cancel'
import { AccountSidebarNavigation } from '@/components/account-sidebar-navigation'
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

type AccountView = 'overview' | 'bookings' | 'profile' | 'favorites' | 'settings'
const views: AccountView[] = ['overview', 'bookings', 'profile', 'favorites', 'settings']

export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ view?: string; filter?: string; page?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const session = await payload.auth({ headers: await headers() })
  const user = session.user
  if (!user) redirect('/' + locale + '/auth')
  if (user.role !== 'customer' && user.role !== 'admin') notFound()

  const query = await searchParams
  const view: AccountView = views.includes(query.view as AccountView) ? query.view as AccountView : 'overview'
  const filter: BookingHistoryFilter = query.filter === 'upcoming' || query.filter === 'past' ? query.filter : 'all'
  const requestedPage = typeof query.page === 'string' && /^[1-9][0-9]{0,2}$/.test(query.page)
    ? Number(query.page) : 1
  const actor = { id: Number(user.id), role: user.role }
  const history = view === 'bookings' ? await getOwnBookingHistory(payload, actor, {
    limit: 10, page: requestedPage, filter,
  }) : null
  const pageNumber = Math.min(requestedPage, Math.max(1, history?.totalPages ?? 1))
  const page = history && pageNumber !== requestedPage
    ? await getOwnBookingHistory(payload, actor, { limit: 10, page: pageNumber, filter })
    : history
  const accountUrl = (nextFilter: BookingHistoryFilter, nextPage = 1) =>
    '/' + locale + '/account?view=bookings&filter=' + nextFilter + '&page=' + nextPage + '#appointments'

  const displayName = typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim()
    : (typeof user.email === 'string' ? user.email : '')
  const firstName = displayName.split(/\s+/)[0] || (uk ? 'друже' : 'friend')
  const avatarRelation = 'avatar' in user ? user.avatar : null
  let avatarUrl: string | null = avatarRelation && typeof avatarRelation === 'object' &&
    'url' in avatarRelation && typeof avatarRelation.url === 'string' ? avatarRelation.url : null
  if (!avatarUrl && (typeof avatarRelation === 'number' || typeof avatarRelation === 'string')) {
    const media = await payload.findByID({ collection: 'media', id: Number(avatarRelation), depth: 0 })
    avatarUrl = typeof media.url === 'string' ? media.url : null
  }
  const phone = 'phone' in user && typeof user.phone === 'string' ? user.phone : ''
  const email = typeof user.email === 'string' ? user.email : ''
  const canCancel = bookingWritesEnabled(process.env)
  const upcoming = await getOwnBookingHistory(payload, actor, {
    filter: 'upcoming', activeOnly: true, ascending: true, limit: 1,
  })
  const nextBooking = upcoming.bookings[0]
  // The dashboard preview uses the same booking filters as the full history.
  // Keep the preview bounded to two records; the full view retains pagination.
  const previewFilter: BookingHistoryFilter = filter
  const recent = view === 'overview' ? await getOwnBookingHistory(payload, actor, {
    filter: previewFilter, limit: 2, ascending: previewFilter === 'upcoming',
  }) : null
  const recentDetails = await Promise.all((recent?.bookings ?? []).map(async booking => {
    const [person, visitServices] = await Promise.all([
      payload.findByID({ collection: 'barbers', id: booking.barberId, depth: 1, overrideAccess: true }),
      payload.find({ collection: 'services', where: { id: { in: booking.serviceIds } },
        depth: 0, limit: 10, overrideAccess: true }),
    ])
    const portraitUrl = person.portrait && typeof person.portrait === 'object' &&
      typeof person.portrait.url === 'string' ? person.portrait.url : null
    return { ...booking, portraitUrl, barberName: person.name,
      serviceNames: visitServices.docs.map(service => service.name).join(' + ') }
  }))

  const [barber, location, services] = nextBooking
    ? await Promise.all([
      payload.findByID({ collection: 'barbers', id: nextBooking.barberId, depth: 1, overrideAccess: true }),
      payload.findByID({ collection: 'locations', id: nextBooking.locationId, depth: 0, overrideAccess: true }),
      payload.find({ collection: 'services', where: { id: { in: nextBooking.serviceIds } },
        depth: 0, limit: 10, overrideAccess: true }),
    ]) : [null, null, null]
  const portrait = barber?.portrait && typeof barber.portrait === 'object' &&
    typeof barber.portrait.url === 'string' ? barber.portrait.url : null
  const dateLocale = uk ? 'uk-UA' : 'en-GB'
  const dateFormat = new Intl.DateTimeFormat(dateLocale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv',
  })
  const shortDate = new Intl.DateTimeFormat(dateLocale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Kyiv',
  })
  const timeFormat = new Intl.DateTimeFormat(dateLocale, {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv',
  })
  const overviewLink = '/' + locale + '/account#overview'
  const profileLink = '/' + locale + '/account?view=profile#profile-editor'
  const bookingsLink = accountUrl('all')
  const favoriteLink = '/' + locale + '/account?view=favorites#favorites'
  const settingsLink = '/' + locale + '/account?view=settings#settings'

  return (
    <main className="landing account-page">
      <SiteHeader locale={locale} />
      <div className="account-shell">
        <aside className="account-sidebar" aria-label={uk ? 'Навігація кабінету' : 'Account navigation'}>
          <p className="account-sidebar__title">GENTLEMEN’S</p>
          <AccountSidebarNavigation locale={locale} view={view} />
          <Link className="account-sidebar__booking" href={'/' + locale + '/booking'}>
            {uk ? 'Записатися' : 'Book a visit'} <ChevronRight size={16} />
          </Link>
        </aside>

        <div className="account-content">
          {view === 'overview' ? <>
            <header id="overview" className="account-welcome">
              <div>
                <h1>{uk ? 'Вітаємо, ' : 'Welcome, '}{firstName}!</h1>
                <span className="account-welcome__accent" aria-hidden="true" />
                <p className="account-welcome__lead">{uk ? 'Дякуємо, що ви з Gentlemen’s Barbershop!' : 'Thanks for being with Gentlemen’s Barbershop!'}</p>
                <p>{uk ? 'Керуйте записами та персональними даними.' : 'Manage your visits and personal information.'}</p>
              </div>
              <Link className="account-primary-action" href={'/' + locale + '/booking'}>
                <CalendarDays size={19} />{uk ? 'Новий запис' : 'New booking'}
              </Link>
            </header>
            <section className="account-next" aria-labelledby="next-visit-heading">
              {portrait && <div className="account-next__portrait"><Image src={portrait}
                alt={uk ? 'Фото барбера' : 'Barber portrait'} width={320} height={380} unoptimized /></div>}
              <div className="account-next__body">
                <p className="account-kicker">{uk ? 'ВАШ НАСТУПНИЙ ВІЗИТ' : 'YOUR NEXT VISIT'}</p>
                {nextBooking ? <>
                  <h2 id="next-visit-heading">{dateFormat.format(new Date(nextBooking.startsAt))}</h2>
                  <p className="account-next__time"><Clock3 size={19} />{timeFormat.format(new Date(nextBooking.startsAt))}</p>
                  <div className="account-next__facts">
                    <p><CircleUserRound size={18} /><span>{uk ? 'Барбер:' : 'Barber:'} <strong>{barber?.name ?? '—'}</strong></span></p>
                    <p><MapPin size={18} /><span>{uk ? 'Заклад:' : 'Location:'} <strong>{location?.name ?? '—'}</strong></span></p>
                    <p><Scissors size={18} /><span>{uk ? 'Послуги:' : 'Services:'} <strong>{services?.docs.map(service => service.name).join(' + ') || '—'}</strong></span></p>
                  </div>
                  <div className="account-next__actions">
                    <span className={'account-status account-status--' + nextBooking.status}>{statusLabels[locale][nextBooking.status]}</span>
                    <Link href={bookingsLink}>{uk ? 'Деталі запису' : 'Booking details'} <ChevronRight size={16}/></Link>
                    {canCancel && <AccountBookingCancel id={nextBooking.id} locale={locale} />}
                  </div>
                </> : <>
                  <h2 id="next-visit-heading">{uk ? 'Майбутніх записів немає' : 'No upcoming visits'}</h2>
                  <p>{uk ? 'Оберіть зручний час для наступного візиту.' : 'Choose a convenient time for your next visit.'}</p>
                  <Link href={'/' + locale + '/booking'}>{uk ? 'Обрати час' : 'Choose a time'} <ChevronRight size={16}/></Link>
                </>}
              </div>
            </section>
            <div className="account-activity-grid">
              <section id="visits" className="account-panel account-activity-card" aria-labelledby="account-history-heading">
                <div className="account-card-heading">
                  <h2 id="account-history-heading">{uk ? 'ІСТОРІЯ ВІДВІДУВАНЬ' : 'VISIT HISTORY'}</h2>
                  <Link href={accountUrl(previewFilter)}>{uk ? 'Усі записи' : 'All bookings'} <ChevronRight size={15}/></Link>
                </div>
                <nav className="account-overview-filters" aria-label={uk ? 'Фільтр записів' : 'Booking filter'}>
                  {(['all','upcoming','past'] as const).map(option =>
                    <Link key={option} href={`/${locale}/account?filter=${option}#visits`}
                      aria-current={previewFilter === option ? 'page' : undefined}
                      className={previewFilter === option ? 'is-active' : undefined}>
                      {option === 'all' ? (uk ? 'Усі' : 'All') : option === 'upcoming'
                        ? (uk ? 'Майбутні' : 'Upcoming') : (uk ? 'Минулі' : 'Past')}
                    </Link>
                  )}
                </nav>
                {recentDetails.length ? (
                  <ul className="account-recent-list">
                    {recentDetails.map(booking => <li key={booking.id}>
                      <div className="account-recent-list__thumb">
                        {booking.portraitUrl
                          ? <Image src={booking.portraitUrl} alt="" width={48} height={54} unoptimized />
                          : <Scissors size={22} aria-hidden="true" />}
                      </div>
                      <time className="account-recent-list__date" dateTime={booking.startsAt}>
                        {shortDate.format(new Date(booking.startsAt))}
                      </time>
                      <span className="account-recent-list__text">
                        <strong>{booking.serviceNames || (uk ? 'Візит №' : 'Visit #') + booking.id}</strong>
                        <small>{uk ? 'Барбер: ' : 'Barber: '}{booking.barberName}</small>
                      </span>
                      <span className={`account-status account-status--${booking.status}`}>
                        {statusLabels[locale][booking.status]}
                      </span>
                    </li>)}
                  </ul>
                ) : <div className="account-card-empty">
                  <CalendarDays size={25}/><p>{
                    previewFilter === 'upcoming' ? (uk ? 'Майбутніх записів поки немає.' : 'No upcoming bookings yet.') :
                    previewFilter === 'past' ? (uk ? 'Минулих записів поки немає.' : 'No past bookings yet.') :
                    (uk ? 'Записів поки немає.' : 'No bookings yet.')
                  }</p>
                </div>}
              </section>
              <section id="reviews" className="account-panel account-activity-card" aria-labelledby="account-reviews-heading">
                <div className="account-card-heading">
                  <h2 id="account-reviews-heading">{uk ? 'МОЇ ВІДГУКИ' : 'MY REVIEWS'}</h2>
                  <span className="account-card-heading__disabled">{uk ? 'Невдовзі' : 'Coming soon'}</span>
                </div>
                <div className="account-card-empty">
                  <Star size={25}/>
                  <p>{uk ? 'Тут з’являться відгуки про завершені візити, коли функція стане доступною.' : 'Reviews of completed visits will appear here when the feature launches.'}</p>
                </div>
              </section>
            </div>
          </> : view === 'bookings' ? (
            <section id="appointments" className="account-panel account-bookings-view" aria-labelledby="account-bookings-heading">
              <div className="account-heading">
                <div><p className="account-kicker">{uk ? 'ВАШІ ВІЗИТИ' : 'YOUR VISITS'}</p>
                  <h1 id="account-bookings-heading">{uk ? 'Мої записи' : 'My bookings'}</h1></div>
                <Link href={'/' + locale + '/booking'} className="account-text-link">{uk ? 'Новий запис' : 'New booking'} <ChevronRight size={16}/></Link>
              </div>
              <nav className="account-filters" aria-label={uk ? 'Фільтр записів' : 'Booking filter'}>
                {(['all','upcoming','past'] as const).map(option => <Link key={option} href={accountUrl(option)}
                  aria-current={filter === option ? 'page' : undefined} className={filter === option ? 'is-active' : undefined}>
                  {option === 'all' ? (uk ? 'Усі' : 'All') : option === 'upcoming'
                    ? (uk ? 'Майбутні' : 'Upcoming') : (uk ? 'Минулі' : 'Past')}
                </Link>)}
              </nav>
              {page && page.bookings.length ? <ul className="account-booking-list">
                {page.bookings.map(booking => <li key={booking.id} className="account-booking">
                  <div className="account-booking__date"><CalendarDays size={19}/>
                    <time dateTime={booking.startsAt}>{dateFormat.format(new Date(booking.startsAt))}</time>
                    <strong>{timeFormat.format(new Date(booking.startsAt))}</strong></div>
                  <div className="account-booking__info"><strong>{uk ? 'Запис №' : 'Booking #'}{booking.id}</strong>
                    <span>{uk ? 'Послуг: ' : 'Services: '}{booking.serviceIds.length}</span></div>
                  <div className="account-booking__actions">
                    <span className={'account-status account-status--' + booking.status}>{statusLabels[locale][booking.status]}</span>
                    {canCancel && (booking.status === 'pending' || booking.status === 'confirmed') &&
                      <AccountBookingCancel id={booking.id} locale={locale}/>}
                  </div>
                </li>)}
              </ul> : <div className="account-empty"><CalendarDays size={30}/>
                <p>{uk ? 'Записів за вибраним фільтром немає.' : 'No bookings match this filter.'}</p>
                <Link href={'/' + locale + '/booking'}>{uk ? 'Обрати час' : 'Choose a time'}</Link></div>}
              {page && page.totalPages > 1 && <nav className="account-pagination" aria-label={uk ? 'Сторінки історії' : 'Booking history pages'}>
                {pageNumber > 1 ? <Link href={accountUrl(filter, pageNumber - 1)}>{uk ? '← Назад' : '← Previous'}</Link>
                  : <span aria-disabled="true">{uk ? '← Назад' : '← Previous'}</span>}
                <span>{uk ? 'Сторінка ' : 'Page '}{pageNumber}{uk ? ' із ' : ' of '}{page.totalPages}</span>
                {page.hasNextPage ? <Link href={accountUrl(filter, pageNumber + 1)}>{uk ? 'Далі →' : 'Next →'}</Link>
                  : <span aria-disabled="true">{uk ? 'Далі →' : 'Next →'}</span>}
              </nav>}
            </section>
          ) : view === 'profile' ? (
            <section id="profile-editor" className="account-panel account-editor-view">
              <div className="account-heading">
                <div><p className="account-kicker">{uk ? 'ОСОБИСТІ ДАНІ' : 'PERSONAL DETAILS'}</p>
                  <h1>{uk ? 'Редагувати профіль' : 'Edit profile'}</h1></div>
                <Link className="account-text-link" href={overviewLink}>{uk ? 'До огляду' : 'Back to overview'} <ChevronRight size={16}/></Link>
              </div>
              <div className="account-identity">
                <AccountAvatar initialUrl={avatarUrl} locale={locale}/>
                <AccountProfileName initialName={displayName} initialPhone={phone}
                  email={email} userId={Number(user.id)} locale={locale}/>
              </div>
            </section>
          ) : (
            <section id={view} className="account-panel account-placeholder-view">
              {view === 'favorites' ? <Heart size={32}/> : <Settings2 size={32}/>}
              <h1>{view === 'favorites' ? (uk ? 'Обране' : 'Favorites') : (uk ? 'Налаштування' : 'Settings')}</h1>
              <p>{view === 'favorites'
                ? (uk ? 'Збережені товари й послуги з’являться тут після запуску функції.' : 'Saved products and services will appear here when this feature launches.')
                : (uk ? 'Мова та тема змінюються через перемикачі у верхній панелі. Інші параметри з’являться пізніше.' : 'Use the header controls for language and theme. More preferences are coming later.')}</p>
              {view === 'settings' && <Link href={'/' + locale + '/auth/forgot-password'}>
                {uk ? 'Відновлення пароля' : 'Password recovery'} <ChevronRight size={16}/></Link>}
            </section>
          )}
          <p className="account-privacy-note"><ShieldCheck size={16}/>
            {uk ? 'Дані кабінету доступні лише у вашій авторизованій сесії.' :
              'Your account data is available only in your authenticated session.'}</p>
        </div>

        <aside className="account-aside" aria-label={uk ? 'Персональні віджети' : 'Personal widgets'}>
          <section id="profile" className="account-panel account-panel--profile" aria-labelledby="profile-card-title">
            <div className="account-card-heading">
              <h2 id="profile-card-title">{uk ? 'МІЙ ПРОФІЛЬ' : 'MY PROFILE'}</h2>
              <Link href={profileLink}>{uk ? 'Редагувати' : 'Edit'} <ChevronRight size={15}/></Link>
            </div>
            <div className="account-identity account-identity--summary">
              <AccountAvatar initialUrl={avatarUrl} locale={locale}/>
              <div className="account-summary-details">
                <h3>{displayName}</h3>
                <p><Mail size={16} aria-hidden="true"/><span>{email}</span></p>
                <p><CircleUserRound size={16} aria-hidden="true"/><span>{phone || (uk ? 'Телефон не вказано' : 'No phone number')}</span></p>
              </div>
            </div>
          </section>
          <section id="loyalty" className="account-panel account-loyalty" aria-labelledby="loyalty-card-title">
            <div className="account-card-heading"><h2 id="loyalty-card-title">
              {uk ? 'ПРОГРАМА ЛОЯЛЬНОСТІ' : 'LOYALTY PROGRAM'}</h2><Crown size={21}/></div>
            <div className="account-loyalty__pending"><Gift size={29}/>
              <strong>{uk ? 'Програма готується до запуску' : 'Loyalty program coming soon'}</strong></div>
            <p>{uk ? 'Ваші бали та рівень з’являться тут після запуску програми. Зараз бонуси не нараховуються.' :
              'Your points and membership tier will appear here after launch. No points are being awarded yet.'}</p>
          </section>
          <section id="notifications" className="account-panel account-notifications" aria-labelledby="notifications-card-title">
            <div className="account-card-heading"><h2 id="notifications-card-title">
              {uk ? 'СПОВІЩЕННЯ' : 'NOTIFICATIONS'}</h2><Bell size={19}/></div>
            <div className="account-card-empty"><Bell size={25}/>
              <p>{uk ? 'Сповіщення про записи та бонуси будуть доступні після запуску модуля.' :
                'Booking and loyalty notifications will appear once the module launches.'}</p></div>
          </section>
        </aside>
      </div>
    </main>
  )
}
