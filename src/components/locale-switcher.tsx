'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { locales, type Locale } from '@/i18n/config'
import { localePath } from '@/i18n/paths'
import { getFallbackMessages } from '@/i18n/messages'

/** Preserve the booking draft guard in both the normal and compact switcher. */
export function LocaleSwitcher({
  locale,
  messages,
  compact = false,
}: {
  locale: Locale
  messages?: ReturnType<typeof getFallbackMessages>
  compact?: boolean
}) {
  const t = messages ?? getFallbackMessages(locale)
  const pathname = usePathname()
  const currentPath = pathname.replace(/^\/(uk|en)(?=\/|$)/, '')
  const bookingInProgress = currentPath === '/booking'
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

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

  function confirmSwitch(event: React.MouseEvent<HTMLAnchorElement>, nextLocale: Locale) {
    if (nextLocale === locale) {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (bookingInProgress && !window.confirm(t.language.discardBooking)) {
      event.preventDefault()
      return
    }
    setOpen(false)
  }

  if (!compact) {
    return <nav className="locale-switcher" aria-label={t.language.navigation}>
      {locales.map(option =>
        <Link
          key={option}
          href={localePath(option, currentPath)}
          hrefLang={option}
          lang={option}
          aria-current={option === locale ? 'page' : undefined}
          aria-label={option === 'uk' ? t.language.ukrainian : t.language.english}
          onClick={event => confirmSwitch(event, option)}
        >{option.toUpperCase()}</Link>
      )}
    </nav>
  }

  return <div className="locale-compact" ref={root}>
    <button
      type="button"
      className="locale-compact__trigger"
      aria-label={t.language.navigation}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >
      {locale.toUpperCase()}
      <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
    </button>
    {open && <div role="menu" aria-label={t.language.navigation} className="locale-compact__panel">
      {locales.map(option =>
        <Link
          role="menuitem"
          key={option}
          href={localePath(option, currentPath)}
          hrefLang={option}
          lang={option}
          aria-current={option === locale ? 'page' : undefined}
          onClick={event => confirmSwitch(event, option)}
        >{option === 'uk' ? t.language.ukrainian : t.language.english}</Link>
      )}
    </div>}
  </div>
}
