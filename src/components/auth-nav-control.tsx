'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, CalendarPlus, LayoutDashboard, LogIn, LogOut, Scissors, Settings2, Star, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Locale } from '@/i18n/config'

type SessionUser = {
  id: string | number
  email?: string
  displayName?: string | null
  role?: string
  avatar?: { url?: string | null } | null
}

export function AuthNavControl({ locale }: { locale: Locale }) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadSession() {
      try {
        const response = await fetch('/api/users/me', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const result: { user?: SessionUser | null } = await response.json()
        if (!controller.signal.aborted) setUser(result.user ?? null)
      } catch {
        // With an unreachable backend, keep the interface in guest mode.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadSession()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    function refreshAvatar(event: Event) {
      const detail = (event as CustomEvent<{ url: string | null }>).detail
      if (detail && (detail.url === null || typeof detail.url === 'string')) {
        setUser(current => current ? { ...current, avatar: detail.url ? { url: detail.url } : null } : current)
      }
    }
    window.addEventListener('account-avatar-updated', refreshAvatar)
    return () => window.removeEventListener('account-avatar-updated', refreshAvatar)
  }, [])

  useEffect(() => {
    if (!open) return
    const onOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  async function signOut() {
    setSigningOut(true)
    setSignOutError(false)
    try {
      const response = await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Logout failed')
      setOpen(false)
      setUser(null)
      router.replace(`/${locale}`)
      router.refresh()
    } catch {
      setSignOutError(true)
      setSigningOut(false)
    }
  }

  if (loading) {
    return <span className="auth-nav__loading" aria-label={uk ? 'Перевірка авторизації' : 'Checking session'} />
  }

  if (!user) {
    return (
      <Link
        className="auth-nav__guest"
        href={`/${locale}/auth`}
        aria-label={uk ? 'Увійти або зареєструватися' : 'Log in or sign up'}
        title={uk ? 'Вхід / реєстрація' : 'Log in / Sign up'}
      >
        <LogIn size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    )
  }

  const name = user.displayName || user.email || (uk ? 'Користувач' : 'Account')
  const avatar = user.avatar && typeof user.avatar === 'object' ? user.avatar.url : null

  return <div ref={root} className="auth-nav">
    <button
      className="auth-nav__avatar"
      type="button"
      aria-label={uk ? `Профіль: ${name}` : `Account: ${name}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >
      <Image
        src={avatar || '/images/brand/no-avatar.svg'}
        alt=""
        width={44}
        height={44}
        unoptimized
        className="auth-nav__avatar-image"
      />
    </button>
    <div className="auth-nav__panel" role="menu" aria-label={uk ? 'Меню профілю' : 'Account menu'} data-state={open ? 'open' : 'closed'} aria-hidden={!open} inert={!open}>
      <div className="auth-nav__identity">
        <Image src={avatar || '/images/brand/no-avatar.svg'} width={46} height={46}
          unoptimized className="auth-nav__identity-avatar" alt="" />
        <div className="auth-nav__identity-text">
          <strong>{name}</strong>
          {user.displayName && user.email && <span>{user.email}</span>}
        </div>
      </div>
      {user.role !== 'barber' && <div className="auth-nav__group">
        <Link role="menuitem" href={`/${locale}/account#overview`} onClick={() => setOpen(false)}>
          <UserRound size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Мій кабінет' : 'My account'}
        </Link>
        <Link role="menuitem" href={`/${locale}/account#bookings`} onClick={() => setOpen(false)}>
          <CalendarDays size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Мої записи' : 'My bookings'}
        </Link>
        <Link role="menuitem" href={`/${locale}/booking`} onClick={() => setOpen(false)}>
          <CalendarPlus size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Новий запис' : 'New booking'}
        </Link>
        <Link role="menuitem" href={`/${locale}/account#reviews`} onClick={() => setOpen(false)}>
          <Star size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Мої відгуки' : 'My reviews'}
        </Link>
        <Link role="menuitem" href={`/${locale}/account#settings`} onClick={() => setOpen(false)}>
          <Settings2 size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Налаштування' : 'Settings'}
        </Link>
      </div>}
      {(user.role === 'admin' || user.role === 'barber') && <div className="auth-nav__group auth-nav__group--staff">
        {user.role === 'admin' ? (
          <Link role="menuitem" href="/admin" onClick={() => setOpen(false)}>
            <LayoutDashboard size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Адмінпанель' : 'Admin dashboard'}
            <span className="auth-nav__role-tag">ADMIN</span>
          </Link>
        ) : (
          <div className="auth-nav__disabled" aria-disabled="true">
            <Scissors size={18} strokeWidth={1.7} aria-hidden="true" />
            <span>{uk ? 'Кабінет барбера' : 'Barber dashboard'}</span>
            <span className="auth-nav__role-tag">{uk ? 'Незабаром' : 'Soon'}</span>
          </div>
        )}
      </div>}
      <div className="auth-nav__group auth-nav__group--footer">
        {signOutError && <p role="alert" className="auth-nav__error">{uk ? 'Не вдалося вийти. Спробуй ще раз.' : 'Could not log out. Please retry.'}</p>}
        <button type="button" role="menuitem" disabled={signingOut} onClick={() => void signOut()}>
          <LogOut size={18} strokeWidth={1.7} aria-hidden="true" />{uk ? 'Вийти' : 'Log out'}
        </button>
      </div>
    </div>
  </div>
}
