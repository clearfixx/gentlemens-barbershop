import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isLocale } from '@/i18n/config'
import '../../globals.css'

/**
 * Locale-aware public root layout. Payload's admin has a different root layout.
 * The document's lang must match its visible translations.
 */
export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return <html lang={locale}><body>{children}</body></html>
}
