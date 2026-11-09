'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { locales, type Locale } from '@/i18n/config'
import { localePath } from '@/i18n/paths'

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname()
  const currentPath = pathname.replace(/^\/(uk|en)(?=\/|$)/, '')

  return <nav className="locale-switcher" aria-label={locale === 'uk' ? 'Мова сайту' : 'Website language'}>
    {locales.map(option =>
      <Link key={option} href={localePath(option, currentPath)} hrefLang={option} lang={option} aria-current={option === locale ? 'page' : undefined} aria-label={option === 'uk' ? 'Українська' : 'English'}>{option.toUpperCase()}</Link>
    )}
  </nav>
}
