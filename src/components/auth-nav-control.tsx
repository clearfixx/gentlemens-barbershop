'use client'

import Link from 'next/link'
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 17l4-4-4-4M14 13H4" />
          <path d="M12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
        </svg>
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
      {avatar ? (
        <img src={avatar} alt="" className="auth-nav__avatar-image" />
      ) : (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20c0-4 2.5-6 7-6s7 2 7 6" />
        </svg>
      )}
    </button>
    {open && <div className="auth-nav__panel" role="menu" aria-label={uk ? 'Меню профілю' : 'Account menu'}>
      <p className="auth-nav__identity">{name}</p>
      <Link role="menuitem" href={`/${locale}/booking`} onClick={() => setOpen(false)}>{uk ? 'Мій запис' : 'Book a visit'}</Link>
      <Link role="menuitem" href={`/${locale}/catalog`} onClick={() => setOpen(false)}>{uk ? 'Каталог' : 'Catalog'}</Link>
      {user.role === 'admin' && <a role="menuitem" href="/admin">{uk ? 'Адміністрування' : 'Admin'}</a>}
      <button type="button" role="menuitem" disabled={signingOut} onClick={() => void signOut()}>
        {uk ? 'Вийти' : 'Log out'}
      </button>
    </div>}
  </div>
}
