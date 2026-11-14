import './auth-page.css'

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CustomerAuthForm } from '@/components/customer-auth-form'
import { SiteHeader } from '@/components/site-header'
import { isLocale } from '@/i18n/config'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'en' ? 'Sign in or sign up | Gentlemen’s Barbershop' : 'Вхід і реєстрація | Gentlemen’s Barbershop',
    robots: { index: false, follow: false },
  }
}

export default async function CustomerAuthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return <main className="landing customer-auth-page">
    <SiteHeader locale={locale} />
    <CustomerAuthForm locale={locale} />
  </main>
}
