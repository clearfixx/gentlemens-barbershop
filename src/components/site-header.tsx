import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { getFallbackMessages } from '@/i18n/messages'

const t = getFallbackMessages('uk')
const links = [
  { href: '/#about', label: t.nav.about },
  { href: '/catalog', label: t.nav.catalog },
  { href: '/booking', label: t.nav.booking },
  { href: '/#team', label: t.nav.team },
  { href: '/#locations', label: t.nav.locations },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-brand" aria-label={`Gentlemen’s Barbershop — ${t.nav.home}`}>
        <span className="site-brand__symbol" aria-hidden="true">✦</span>
        <span>GENTLEMEN’S <small>BARBERSHOP</small></span>
      </Link>
      <nav aria-label={t.nav.primary} className="site-nav">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <ThemeToggle />
        <Link className="header-booking" href="/booking">{t.actions.planVisit}</Link>
      </div>
    </header>
  )
}
