'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { locales, type Locale } from '@/i18n/config'
import { localePath } from '@/i18n/paths'
import { getFallbackMessages } from '@/i18n/messages'

/**
 * Booking selections and customer details are kept in component memory only.
 * Warn before changing locale on that route; never silently discard the draft.
 */
export function LocaleSwitcher({ locale, messages }: { locale: Locale; messages?: ReturnType<typeof getFallbackMessages> }) {
  const t = messages ?? getFallbackMessages(locale)
  const pathname = usePathname()
  const currentPath = pathname.replace(/^\/(uk|en)(?=\/|$)/, '')
  const bookingInProgress = currentPath === '/booking'

  function confirmSwitch(event: React.MouseEvent<HTMLAnchorElement>, nextLocale: Locale) {
    if (nextLocale === locale) {
      event.preventDefault()
      return
    }
    if (!bookingInProgress) return
    const warning = t.language.discardBooking
    if (!window.confirm(warning)) event.preventDefault()
  }

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
