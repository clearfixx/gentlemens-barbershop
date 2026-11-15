import '../auth-page.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PasswordRecovery } from '@/components/password-recovery'
import { SiteHeader } from '@/components/site-header'
import { isLocale } from '@/i18n/config'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Gentlemen’s Barbershop | Password recovery', robots: { index: false, follow: false } }
}
export default async function Page({ params }: {
  params: Promise<{ locale: string }>
  
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  
  return <main className="landing customer-auth-page">
    <SiteHeader locale={locale} />
    <PasswordRecovery locale={locale} />
  </main>
}
