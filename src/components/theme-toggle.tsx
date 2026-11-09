'use client'

import { useEffect } from 'react'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'gentlemens-theme'

export function ThemeToggle({ locale }: { locale: Locale }) {
  const t = getFallbackMessages(locale)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial: Theme = saved === 'light' || saved === 'dark' ? saved : preferred ? 'dark' : 'light'
    document.documentElement.dataset.theme = initial
  }, [])

  const toggle = () => {
    const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle}
      aria-label={t.actions.switchTheme}
      title={t.actions.switchTheme}>
      <span className="theme-toggle__moon" aria-hidden="true">☾</span>
      <span className="theme-toggle__sun" aria-hidden="true">☀</span>
    </button>
  )
}
