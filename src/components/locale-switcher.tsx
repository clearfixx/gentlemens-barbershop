import Link from 'next/link'
import { locales, type Locale } from '@/i18n/config'

/** Server-rendered, keyboard-accessible switcher for localized public routes. */
export function LocaleSwitcher({ locale, path = '' }: { locale: Locale; path?: string }) {
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return <nav className="locale-switcher" aria-label={locale === 'uk' ? 'Мова сайту' : 'Website language'}>
    {locales.map(option =>
      <Link
        key={option}
        href={`/${option}${suffix}`}
        hrefLang={option}
        lang={option}
        aria-current={option === locale ? 'page' : undefined}
        aria-label={option === 'uk' ? 'Українська' : 'English'}
      >{option.toUpperCase()}</Link>
    )}
  </nav>
}
