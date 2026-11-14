'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Locale } from '@/i18n/config'

export function UserMenu({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const uk = locale === 'uk'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return <div className="user-menu" ref={root}>
    <button type="button" className="user-menu__trigger" aria-expanded={open} aria-haspopup="menu"
      aria-label={uk ? 'Меню користувача' : 'User menu'} onClick={() => setOpen(value => !value)}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.4-4 3.1-6 7.5-6s7.1 2 7.5 6"/></svg>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="user-menu__panel" role="menu" aria-label={uk ? 'Меню користувача' : 'User menu'}>
      <p className="user-menu__status">{uk ? 'Гостьовий режим' : 'Guest mode'}</p>
      <Link role="menuitem" href={`/${locale}/booking`} onClick={() => setOpen(false)}>{uk ? 'Планування запису' : 'Plan a visit'}</Link>
      <Link role="menuitem" href={`/${locale}/catalog`} onClick={() => setOpen(false)}>{uk ? 'Каталог' : 'Catalog'}</Link>
      <Link role="menuitem" href="/admin" onClick={() => setOpen(false)}>{uk ? 'Вхід для персоналу' : 'Staff sign in'}</Link>
    </div>}
  </div>
}
