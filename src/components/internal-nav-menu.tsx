'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Locale } from '@/i18n/config'

type NavLink = { href: string; label: string }

export function InternalNavMenu({
  locale,
  anchorLinks,
}: {
  locale: Locale
  anchorLinks: NavLink[]
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const uk = locale === 'uk'

  useEffect(() => {
    if (!open) return
    const onOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
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

  const internalLinks = [
    { href: `/${locale}/booking`, label: uk ? 'Онлайн-запис' : 'Book an appointment' },
    { href: `/${locale}/catalog`, label: uk ? 'Каталог послуг і майстрів' : 'Services and barbers' },
  ]

  return (
    <div className="internal-nav-menu" ref={container}>
      <button
        type="button"
        className="internal-nav-menu__trigger"
        aria-label={uk ? 'Відкрити меню сторінок' : 'Open pages menu'}
        aria-expanded={open}
        aria-controls="internal-nav-panel"
        onClick={() => setOpen(value => !value)}
      >
        {open
          ? <X size={23} strokeWidth={1.75} aria-hidden="true" />
          : <Menu size={23} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      {open && <div id="internal-nav-panel" className="internal-nav-menu__panel">
        <p className="internal-nav-menu__caption">{uk ? 'Розділи сайту' : 'Pages'}</p>
        {internalLinks.map(link => (
          <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
        ))}
        <div className="internal-nav-menu__mobile">
          <p className="internal-nav-menu__caption">{uk ? 'На головній' : 'On the homepage'}</p>
          {anchorLinks.map(link => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
        </div>
      </div>}
    </div>
  )
}
