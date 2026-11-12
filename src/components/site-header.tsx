import Image from 'next/image'
import Link from 'next/link'
import { Bell } from 'lucide-react'

import { AuthNavControl } from './auth-nav-control'
import { FloatingHeaderShell } from './floating-header-shell'
import { InternalNavMenu } from './internal-nav-menu'
import { LocaleSwitcher } from './locale-switcher'
import { SectionNav } from './section-nav'
import { ThemeToggle } from './theme-toggle'
import { getFallbackMessages } from '@/i18n/messages'
import type { Locale } from '@/i18n/config'

export function SiteHeader({
  locale = 'uk',
  messages,
}: {
  locale?: Locale
  messages?: ReturnType<typeof getFallbackMessages>
}) {
  const t = messages ?? getFallbackMessages(locale)
  const prefix = `/${locale}`
  // These links always navigate to sections of the homepage, even from a subpage.
  const links = [
    { href: `${prefix}/#about`, label: locale === 'uk' ? 'Чому ми' : 'Why us' },
    { href: `${prefix}/#team`, label: locale === 'uk' ? 'Наші майстри' : 'Our barbers' },
    { href: `${prefix}/#services`, label: locale === 'uk' ? 'Послуги' : 'Services' },
    { href: `${prefix}/#products`, label: locale === 'uk' ? 'Товари' : 'Products' },
    { href: `${prefix}/#news`, label: locale === 'uk' ? 'Новини' : 'News' },
    { href: `${prefix}/#locations`, label: locale === 'uk' ? 'Контакти' : 'Contact' },
  ]

  return (
    <FloatingHeaderShell>
      <Link href={prefix} className="site-brand" aria-label={`Gentlemen’s Barbershop — ${t.nav.home}`}>
        <span className="site-brand__art">
          <Image
            src="/images/brand/logo.svg"
            alt="Gentlemen’s Barbershop"
            width={210}
            height={66}
            className="site-brand__logo"
            priority
          />
        </span>
      </Link>

      <nav aria-label={t.nav.primary} className="site-nav">
        <SectionNav locale={locale} links={links} />
        <InternalNavMenu locale={locale} anchorLinks={links} />
      </nav>

      <div className="site-header__actions">
        <span
          className="header-notification"
          role="img"
          aria-label={locale === 'uk' ? 'Сповіщення поки недоступні' : 'Notifications are not yet available'}
        >
          <Bell size={21} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <AuthNavControl locale={locale} />
        <div className="header-preferences" role="group" aria-label={locale === 'uk' ? 'Вигляд і мова' : 'Appearance and language'}>
          <ThemeToggle locale={locale} />
          <LocaleSwitcher locale={locale} messages={t} compact />
        </div>
      </div>
    </FloatingHeaderShell>
  )
}
