'use client'

import Image from 'next/image'
import Link from 'next/link'
import { LogIn, LogOut } from 'lucide-react'
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
      window.location.assign(`/${locale}`)
    } catch {
      setSigningOutError(true)
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
  const avatar = typeof user.avatar === 'object' ? user.avatar?.url : null

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
    {open && <div className="auth-nav__panel" role="menu" aria-label={uk ? 'Меню профілю' : 'Account menu'}>
      <p className="auth-nav__identity">{name}</p>
      <Link role="menuitem" href={`/${locale}/booking`} onClick={() => setOpen(false)}>{uk ? 'Новий запис' : 'Book a visit'}</Link>
      <Link role="menuitem" href={`/${locale}/catalog`} onClick={() => setOpen(false)}>{uk ? 'Каталог' : 'Catalog'}</Link>
      {user.role === 'admin' && <a role="menuitem" href="/admin">{uk ? 'Адміністрування' : 'Admin'}</a>}
      {signOutError && <p role="alert" className="auth-nav__error">{uk ? 'Не вдалося вийти. Спробуй ще раз.' : 'Could not log out. Please retry.'}</p>}
      <button type="button" role="menuitem" disabled={signingOut} onClick={() => void signOut()}>
        <LogOut size={18} strokeWidth={1.75} aria-hidden="true" /> {uk ? 'Вийти' : 'Log out'}
      </button>
    </div>}
  </div>
}
