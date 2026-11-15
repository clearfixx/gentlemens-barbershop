'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarDays, ChevronDown, Gift, Heart, LayoutDashboard,
  Menu, Settings2, Star, UserRound, X } from 'lucide-react'
import type { Locale } from '@/i18n/config'
import { AccountSidebarLogout } from '@/components/account-sidebar-logout'

type View = 'overview' | 'bookings' | 'profile' | 'favorites' | 'settings'

export function AccountSidebarNavigation({ locale, view }: { locale: Locale; view: View }) {
  const uk = locale === 'uk'
  const [open, setOpen] = useState(false)
  const home = '/' + locale + '/account'
  const links = [
    { label: uk ? 'Огляд' : 'Overview', href: home + '#overview', view: 'overview', icon: LayoutDashboard },
    { label: uk ? 'Мої записи' : 'My bookings', href: home + '?view=bookings&filter=all&page=1#appointments', view: 'bookings', icon: CalendarDays },
    { label: uk ? 'Профіль' : 'Profile', href: home + '?view=profile#profile-editor', view: 'profile', icon: UserRound },
    { label: uk ? 'Відгуки' : 'Reviews', href: home + '#reviews', view: '', icon: Star },
    { label: uk ? 'Обране' : 'Favorites', href: home + '?view=favorites#favorites', view: 'favorites', icon: Heart },
    { label: uk ? 'Лояльність' : 'Loyalty', href: home + '#loyalty', view: '', icon: Gift },
    { label: uk ? 'Налаштування' : 'Settings', href: home + '?view=settings#settings', view: 'settings', icon: Settings2 },
  ] as const
  return <>
    <button type="button" className="account-sidebar__mobile-toggle"
      aria-controls="account-navigation" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={19} aria-hidden="true"/> : <Menu size={19} aria-hidden="true"/>}
      {uk ? 'Меню кабінету' : 'Account menu'}
      <ChevronDown size={16} aria-hidden="true"/>
    </button>
    <nav id="account-navigation" className="account-sidebar__nav" data-expanded={open}>
      {links.map(link => {
        const Icon = link.icon
        const current = link.view === view
        return <Link key={link.href} href={link.href}
          onClick={() => setOpen(false)}
          aria-current={current ? 'page' : undefined}
          className={'account-sidebar__item' + (current ? ' is-current' : '')}>
          <Icon size={19} aria-hidden="true"/>{link.label}
        </Link>
      })}
      <AccountSidebarLogout locale={locale}/>
    </nav>
  </>
}
