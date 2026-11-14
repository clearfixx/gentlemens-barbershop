import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { GuestCancellationForm } from '@/components/guest-cancellation-form'
import { bookingWritesEnabled } from '@/lib/booking/booking-write-guard'
import { guestCancellationDeliveryConfigured } from '@/lib/booking/guest-cancellation'
import { isLocale } from '@/i18n/config'
import { loadPublicMessages } from '@/i18n/load-public-messages'

export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string }>
type SearchParams = Promise<{ bookingId?: string | string[] }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return { robots: { index: false, follow: false } }
  const t = await loadPublicMessages(locale)
  return {
    title: `Gentlemen’s Barbershop | ${t.guestCancellation.title}`,
    description: t.guestCancellation.intro,
    robots: { index: false, follow: false },
  }
}

export default async function GuestCancellationPage({
  params, searchParams,
}: { params: Params; searchParams: SearchParams }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = await loadPublicMessages(locale)
  const query = await searchParams
  const initialBookingId = typeof query.bookingId === 'string' ? query.bookingId : ''
  const enabled = bookingWritesEnabled(process.env) && guestCancellationDeliveryConfigured(process.env)
  return <main className="landing">
    <SiteHeader locale={locale} messages={t} />
    <div className="catalog-page guest-cancel-page">
      <div className="guest-cancel-heading">
        <p className="eyebrow">{t.guestCancellation.eyebrow}</p>
        <h1>{t.guestCancellation.title}</h1>
        <p className="catalog-intro">{t.guestCancellation.intro}</p>
      </div>
      <GuestCancellationForm locale={locale} messages={t}
        initialBookingId={initialBookingId} enabled={enabled} />
    </div>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
