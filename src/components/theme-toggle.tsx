'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'gentlemens-theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial: Theme = saved === 'light' || saved === 'dark' ? saved : preferred ? 'dark' : 'light'
    document.documentElement.dataset.theme = initial
    setTheme(initial)
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    window.localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle}
      aria-label={theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'}
      title={theme === 'light' ? 'Темна тема' : 'Світла тема'}>
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  )
}
