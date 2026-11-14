'use client'

import './hero-slider.css'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Locale } from '@/i18n/config'

const INTERVAL = 7000
const slides = {
  uk: [
    {
      eyebrow: 'ПРЕМІАЛЬНИЙ БАРБЕРШОП',
      title: ['СТИЛЬ.', 'ХАРАКТЕР.', 'ТИ.'],
      description: 'Сучасний сервіс догляду для чоловіків, який цінує якість, атмосферу і увагу до деталей.',
    },
    {
      eyebrow: 'ТРАДИЦІЇ ТА МАЙСТЕРНІСТЬ',
      title: ['ТОЧНІСТЬ.', 'МАЙСТЕРНІСТЬ.', 'СТИЛЬ.'],
      description: 'Досвідчені майстри, які приділяють увагу кожній деталі вашого образу.',
    },
    {
      eyebrow: 'ВАШ ЧАС — ВАШ СТИЛЬ',
      title: ['АТМОСФЕРА.', 'КОМФОРТ.', 'ТИ.'],
      description: 'Місце, де можна відпочити, довіритися майстру та залишитися собою.',
    },
  ],
  en: [
    {
      eyebrow: 'PREMIUM BARBERSHOP',
      title: ['STYLE.', 'CHARACTER.', 'YOU.'],
      description: 'Modern grooming that values craftsmanship, atmosphere and attention to detail.',
    },
    {
      eyebrow: 'TRADITION AND CRAFT',
      title: ['PRECISION.', 'CRAFT.', 'STYLE.'],
      description: 'Experienced barbers who care about every detail of your look.',
    },
    {
      eyebrow: 'YOUR TIME, YOUR STYLE',
      title: ['ATMOSPHERE.', 'COMFORT.', 'YOU.'],
      description: 'A place to unwind, trust your barber and feel like yourself.',
    },
  ],
} as const

export function HeroSlider({ locale }: { locale: Locale }) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const slide = slides[locale][active]
  const running = playing && !hovered && !focused && !reducedMotion

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!running) return
    const timeout = window.setTimeout(() => {
      setActive(current => (current + 1) % slides[locale].length)
      setResetKey(key => key + 1)
    }, INTERVAL)
    return () => window.clearTimeout(timeout)
  }, [active, running, resetKey, locale])

  const goTo = (index: number) => {
    setActive(index)
    setResetKey(key => key + 1)
  }

  return (
    <section
      className="barber-hero"
      aria-label={locale === 'uk' ? 'Головний слайдер' : 'Main carousel'}
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div className="barber-hero__interior" aria-hidden="true" />
      <div className="barber-hero__wash" aria-hidden="true" />
      <div className="barber-hero__scene" aria-hidden="true">
        <Image
          src="/images/hero/barber-chair.png"
          alt=""
          fill
          priority
          sizes="(max-width: 767px) 90vw, 48vw"
          className="barber-hero__chair"
        />
      </div>
      <div className="barber-hero__content">
        <p className="barber-hero__eyebrow">{slide.eyebrow}</p>
        <h1 id="hero-title" className={`barber-hero__headline${active === 1 ? ' barber-hero__headline--long' : ''}`}>
          {slide.title.map(line => <span key={line}>{line}</span>)}
        </h1>
        <p className="barber-hero__description">{slide.description}</p>
        <div className="barber-hero__actions">
          <Link className="barber-hero__primary" href={`/${locale}/booking`}>
            {locale === 'uk' ? 'Записатися онлайн' : 'Book online'} <span aria-hidden="true">→</span>
          </Link>
          <a className="barber-hero__secondary" href="#services">
            {locale === 'uk' ? 'Наші послуги' : 'Our services'}
          </a>
        </div>
        <div className="barber-hero__controls" aria-label={locale === 'uk' ? 'Керування слайдами' : 'Slide controls'}>
          <span className="barber-hero__number">{String(active + 1).padStart(2, '0')}</span>
          <button type="button" className="barber-hero__track" aria-label={locale === 'uk' ? 'Наступний слайд' : 'Next slide'} onClick={() => goTo((active + 1) % slides[locale].length)}>
            <span key={resetKey} className={`barber-hero__fill${running ? ' barber-hero__fill--running' : ''}`} />
          </button>
          <span className="barber-hero__number">03</span>
          <button
            type="button"
            className="barber-hero__pause"
            aria-label={playing ? (locale === 'uk' ? 'Зупинити слайдер' : 'Pause slides') : (locale === 'uk' ? 'Відновити слайдер' : 'Play slides')}
            onClick={() => { setPlaying(value => !value); setResetKey(key => key + 1) }}
          >
            {playing ? 'Ⅱ' : '▶'}
          </button>
        </div>
      </div>
      <a className="barber-hero__down" href="#about" aria-label={locale === 'uk' ? 'До наступної секції' : 'Next section'}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v17m-6-6 6 6 6-6"/>
        </svg>
      </a>
    </section>
  )
}
