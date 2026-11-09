import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { LocaleSwitcher } from './locale-switcher'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'

export function SiteHeader({ locale = 'uk', messages }: { locale?: Locale; messages?: ReturnType<typeof getFallbackMessages> }) {
  const t = messages ?? getFallbackMessages(locale)
  const prefix = `/${locale}`
  const links = [
    { href: `${prefix}/#about`, label: t.nav.about },
    { href: `${prefix}/catalog`, label: t.nav.catalog },
    { href: `${prefix}/booking`, label: t.nav.booking },
    { href: `${prefix}/#team`, label: t.nav.team },
    { href: `${prefix}/#locations`, label: t.nav.locations },
  ]

  return (
    <header className="site-header">
      <Link href={prefix} className="site-brand" aria-label={`Gentlemen’s Barbershop — ${t.nav.home}`}>
        <span className="site-brand__symbol" aria-hidden="true">✦</span>
        <span>GENTLEMEN’S <small>BARBERSHOP</small></span>
      </Link>
      <nav aria-label={t.nav.primary} className="site-nav">
        {links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <LocaleSwitcher locale={locale} />
        <ThemeToggle locale={locale} />
        <Link className="header-booking" href={`${prefix}/booking`}>{t.actions.planVisit}</Link>
      </div>
    </header>
  )
}
