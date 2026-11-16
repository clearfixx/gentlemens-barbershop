'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck } from 'lucide-react'
import type { Locale } from '@/i18n/config'

export function HeaderBookingCta({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  // Avoid a redundant booking action while the visitor is already booking.
  if (pathname?.replace(/\/$/, '') === `/${locale}/booking`) return null

  return (
    <Link className="header-booking-cta" href={`/${locale}/booking`}
      aria-label={locale === 'uk' ? 'Записатися онлайн' : 'Book online'}>
      <CalendarCheck size={17} strokeWidth={1.8} aria-hidden="true" />
      <span className="header-booking-cta__full">{locale === 'uk' ? 'Записатись онлайн' : 'Book online'}</span>
      <span className="header-booking-cta__short" aria-hidden="true">{locale === 'uk' ? 'Записатись' : 'Book'}</span>
    </Link>
  )
}
