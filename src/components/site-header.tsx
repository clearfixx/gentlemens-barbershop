'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { LocaleSwitcher } from './locale-switcher'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'

export function SiteHeader({ locale = 'uk', messages }: { locale?: Locale; messages?: ReturnType<typeof getFallbackMessages> }) {
  const t = messages ?? getFallbackMessages(locale)
  const pathname = usePathname()
  const onLanding = pathname === `/${locale}` || pathname === `/${locale}/`
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [pathname])
  useEffect(() => {
    if (!onLanding) return
    const sectionIds = ['about', 'team', 'locations']
    const sections = sectionIds.map(id => document.getElementById(id)).filter((section): section is HTMLElement => section !== null)
    if (!sections.length) return

    const update = () => {
      // The header offset keeps the active item aligned with what is visible.
      const threshold = Math.min(window.innerHeight * 0.35, 260)
      const current = sections.filter(section => section.getBoundingClientRect().top <= threshold).at(-1)
      setActiveSection(current?.id ?? null)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [onLanding])

  const isActive = (href: string) => {
    const hash = href.split('#')[1]
    return hash ? onLanding && activeSection === hash : pathname === href
  }

  const prefix = `/${locale}`
  const links = [
    { href: `${prefix}/#about`, label: t.nav.about },
    { href: `${prefix}/catalog`, label: t.nav.catalog },
    { href: `${prefix}/booking`, label: t.nav.booking },
    { href: `${prefix}/#team`, label: t.nav.team },
    { href: `${prefix}/#locations`, label: t.nav.locations },
  ]

  return (
    <header className={`site-header${onLanding ? ' site-header--landing' : ''}${scrolled ? ' is-scrolled' : ''}`}>
      <Link href={prefix} className="site-brand" aria-label={`Gentlemen’s Barbershop — ${t.nav.home}`}>
        <span className="site-brand__symbol" aria-hidden="true">✦</span>
        <span>GENTLEMEN’S <small>BARBERSHOP</small></span>
      </Link>
      <nav aria-label={t.nav.primary} className="site-nav">
        {links.map(link => <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} className={isActive(link.href) ? 'is-active' : undefined}>{link.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <LocaleSwitcher locale={locale} messages={t} />
        <ThemeToggle locale={locale} />
        <Link className="header-booking" href={`${prefix}/booking`}>{t.actions.planVisit}</Link>
        <details className="mobile-navigation">
          <summary aria-label={t.nav.primary}>
            <span className="mobile-navigation__bars" aria-hidden="true"><span /><span /><span /></span>
            <span className="visually-hidden">{t.nav.primary}</span>
          </summary>
          <nav aria-label={t.nav.primary} className="mobile-navigation__panel">
            {links.map(link => <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} className={isActive(link.href) ? 'is-active' : undefined}>{link.label}</Link>)}
          </nav>
        </details>
      </div>
    </header>
  )
}
