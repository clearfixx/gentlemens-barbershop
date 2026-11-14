'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type SectionLink = { href: string; label: string }

export function SectionNav({
  locale,
  links,
}: {
  locale: 'uk' | 'en'
  links: SectionLink[]
}) {
  const pathname = usePathname()
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (pathname !== `/${locale}`) return

    const sections = links
      .map(link => {
        const id = link.href.split('#')[1]
        return id ? { id, node: document.getElementById(id) } : null
      })
      .filter((entry): entry is { id: string; node: HTMLElement } => Boolean(entry?.node))

    if (sections.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      // Highlight the section occupying the upper third of the viewport.
      const position = window.innerHeight * 0.35
      const current = [...sections].reverse().find(section =>
        section.node.getBoundingClientRect().top <= position
      )
      setActive(current?.id ?? null)
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [locale, links, pathname])

  return (
    <div className="site-nav__anchors">
      {links.map(link => {
        const section = link.href.split('#')[1]
        const selected = pathname === `/${locale}` && !!section && active === section
        return <Link
          key={link.href}
          href={link.href}
          aria-current={selected ? 'location' : undefined}
          className={selected ? 'site-nav__anchor--active' : undefined}
        >{link.label}</Link>
      })}
    </div>
  )
}
