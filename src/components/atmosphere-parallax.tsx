'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { Locale } from '@/i18n/config'
import './atmosphere-parallax.css'

/**
 * A single, deliberately restrained parallax scene between Team and Reviews.
 * Uses no React state on scroll and never animates content or the site header.
 * Background movement is disabled for reduced motion and narrow viewports.
 */
export function AtmosphereParallax({ locale }: { locale: Locale }) {
  const sectionRef = useRef<HTMLElement>(null)
  const backgroundRef = useRef<HTMLDivElement>(null)
  const uk = locale === 'uk'

  useEffect(() => {
    const section = sectionRef.current
    const background = backgroundRef.current
    if (!section || !background) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const narrowViewport = window.matchMedia('(max-width: 767px)')
    let visible = false
    let frame = 0

    const stop = () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    }

    const render = () => {
      frame = 0
      if (!visible || reducedMotion.matches || narrowViewport.matches) return
      const bounds = section.getBoundingClientRect()
      const total = bounds.height + window.innerHeight
      // -1 as section enters, +1 as it exits: up to 120px in either direction.
      const progress = (window.innerHeight - bounds.top) / total
      const displacement = (Math.max(0, Math.min(1, progress)) - 0.5) * 240
      background.style.transform = `translate3d(0, ${displacement.toFixed(2)}px, 0)`
    }

    const schedule = () => {
      if (frame === 0 && visible && !reducedMotion.matches && !narrowViewport.matches) {
        frame = window.requestAnimationFrame(render)
      }
    }

    const syncMotionPreference = () => {
      if (reducedMotion.matches || narrowViewport.matches) {
        stop()
        background.style.transform = 'translate3d(0, 0, 0)'
      } else {
        schedule()
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) schedule()
      else stop()
    }, { rootMargin: '200px 0px 200px 0px' })

    observer.observe(section)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    reducedMotion.addEventListener('change', syncMotionPreference)
    narrowViewport.addEventListener('change', syncMotionPreference)

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      reducedMotion.removeEventListener('change', syncMotionPreference)
      narrowViewport.removeEventListener('change', syncMotionPreference)
      background.style.transform = ''
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="atmosphere"
      className="atmosphere-parallax"
      aria-labelledby="atmosphere-title"
    >
      <div ref={backgroundRef} className="atmosphere-parallax__background" aria-hidden="true" />
      <div className="atmosphere-parallax__shade" aria-hidden="true" />
      <div className="atmosphere-parallax__content">
        <p className="atmosphere-parallax__kicker">GENTLEMEN’S BARBERSHOP</p>
        <h2 id="atmosphere-title">
          {uk ? 'БІЛЬШЕ, НІЖ СТРИЖКА.' : 'MORE THAN A HAIRCUT.'}
        </h2>
        <p className="atmosphere-parallax__description">
          {uk ? 'Це час, який належить тільки тобі.' : 'Time that belongs entirely to you.'}
        </p>
        <Link className="atmosphere-parallax__action" href={`/${locale}/#locations`}>
          {uk ? 'Відчути атмосферу' : 'Experience the atmosphere'}
        </Link>
      </div>
    </section>
  )
}
