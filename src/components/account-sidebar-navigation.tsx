'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Gift, Heart, LayoutDashboard, Menu, Settings2, Star, UserRound, X } from 'lucide-react'
import type { Locale } from '@/i18n/config'
import { AccountSidebarLogout } from '@/components/account-sidebar-logout'

const ids = ['overview', 'bookings', 'reviews', 'profile-editor', 'favorites', 'loyalty', 'settings'] as const
type SectionId = (typeof ids)[number]

/** One-page anchor navigation, scroll spy, and a mobile off-canvas drawer. */
export function AccountSidebarNavigation({ locale }: { locale: Locale }) {
  const uk = locale === 'uk'
  const [active, setActive] = useState<SectionId>('overview')
  const [open, setOpen] = useState(false)
  const links = [
    { id: 'overview', label: uk ? 'Огляд' : 'Overview', icon: LayoutDashboard },
    { id: 'bookings', label: uk ? 'Мої записи' : 'My bookings', icon: CalendarDays },
    { id: 'profile-editor', label: uk ? 'Профіль' : 'Profile', icon: UserRound },
    { id: 'reviews', label: uk ? 'Відгуки' : 'Reviews', icon: Star },
    { id: 'favorites', label: uk ? 'Обране' : 'Favorites', icon: Heart },
    { id: 'loyalty', label: uk ? 'Лояльність' : 'Loyalty', icon: Gift },
    { id: 'settings', label: uk ? 'Налаштування' : 'Settings', icon: Settings2 },
  ] as const

  useEffect(() => {
    // Follow the section the visitor is reading, not only sections whose
    // heading reaches the sticky-navbar offset. Near the bottom of the page
    // the browser can clamp anchor scrolling, leaving the target heading much
    // lower than 180px (e.g. Loyalty while Favorites stays highlighted).
    // A viewport-relative reading line handles this and short sections.
    let frame = 0
    function sync() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const readingLine = Math.max(180, Math.min(window.innerHeight * 0.34, 360))
        const current = ids.reduce<SectionId>((last, id) => {
          const element = document.getElementById(id)
          return element && element.getBoundingClientRect().top <= readingLine ? id : last
        }, 'overview')
        setActive(current)
      })
    }
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('hashchange', sync)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', sync)
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])

  function select(id: SectionId) {
    setActive(id)
    setOpen(false)
  }

  return <>
    <button type="button" className="account-sidebar__mobile-toggle"
      aria-controls="account-navigation" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={19} aria-hidden="true"/> : <Menu size={19} aria-hidden="true"/>}
      {uk ? 'Меню кабінету' : 'Account menu'}
    </button>
    {open && <button type="button" className="account-sidebar__backdrop"
      aria-label={uk ? 'Закрити меню' : 'Close menu'} onClick={() => setOpen(false)}/>}
    <nav id="account-navigation" className="account-sidebar__nav" data-expanded={open}
      aria-label={uk ? 'Розділи кабінету' : 'Account sections'}>
      {links.map(link => {
        const Icon = link.icon
        return <a key={link.id} href={'#' + link.id}
          onClick={() => select(link.id)}
          aria-current={active === link.id ? 'location' : undefined}
          className={'account-sidebar__item' + (active === link.id ? ' is-current' : '')}>
          <Icon size={19} aria-hidden="true"/>{link.label}
        </a>
      })}
      <AccountSidebarLogout locale={locale}/>
    </nav>
  </>
}
