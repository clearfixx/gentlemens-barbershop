'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function FloatingHeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => {
      const threshold = ref.current?.offsetHeight ?? 72
      setScrolled(window.scrollY >= threshold)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return <header ref={ref} className={`site-header floating-header${scrolled ? ' floating-header--scrolled' : ''}`}>{children}</header>
}
