import Image from 'next/image'
import { FloatingHeaderShell } from './floating-header-shell'
import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { LocaleSwitcher } from './locale-switcher'
import { UserMenu } from './user-menu'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'

export function SiteHeader({ locale = 'uk', messages }: { locale?: Locale; messages?: ReturnType<typeof getFallbackMessages> }) {
  const t = messages ?? getFallbackMessages(locale)
  const prefix = `/${locale}`
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
        <Image src="/images/brand/logo.svg" alt="Gentlemen’s Barbershop" width={210} height={66} className="site-brand__logo" priority />
      </Link>
      <nav aria-label={t.nav.primary} className="site-nav">
        {links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <span className="header-notification" role="img" aria-label={locale === 'uk' ? 'Сповіщення будуть доступні після входу' : 'Notifications available after sign in'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9"/><path d="M10 21h4"/></svg>
        </span>
        <UserMenu locale={locale} />
        <ThemeToggle locale={locale} />
        <LocaleSwitcher locale={locale} messages={t} />
        <Link className="header-booking" href={`${prefix}/booking`}>{locale === 'uk' ? 'Записатися онлайн' : 'Book online'} →</Link>
      </div>
    </FloatingHeaderShell>
  )
}
