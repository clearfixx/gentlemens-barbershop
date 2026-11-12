'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Locale } from '@/i18n/config'

const slides = {
  uk: [
    { eyebrow: 'ПРЕМІАЛЬНИЙ БАРБЕРШОП', lines: ['СТИЛЬ.', 'ХАРАКТЕР.', 'ТИ.'], description: 'Сучасний сервіс догляду для чоловіків, який поєднує майстерність, атмосферу й увагу до деталей.' },
    { eyebrow: 'ТРАДИЦІЇ ТА МАЙСТЕРНІСТЬ', lines: ['МАЙСТЕРНІСТЬ.', 'ТРАДИЦІЇ.', 'СТИЛЬ.'], description: 'Досвідчені майстри, які приділяють увагу кожній деталі вашого образу.' },
    { eyebrow: 'ВАШ ЧАС — ВАШ СТИЛЬ', lines: ['АТМОСФЕРА.', 'КОМФОРТ.', 'ТИ.'], description: 'Місце, де можна відпочити, довіритися майстру та залишитися собою.' },
  ],
  en: [
    { eyebrow: 'PREMIUM BARBERSHOP', lines: ['STYLE.', 'CHARACTER.', 'YOU.'], description: 'Modern grooming that brings together craftsmanship, atmosphere and attention to detail.' },
    { eyebrow: 'TRADITION AND CRAFT', lines: ['TRADITION.', 'CRAFT.', 'STYLE.'], description: 'Experienced barbers who care about every detail of your look.' },
    { eyebrow: 'YOUR TIME, YOUR STYLE', lines: ['ATMOSPHERE.', 'COMFORT.', 'YOU.'], description: 'A place to unwind, trust your barber and feel like yourself.' },
  ],
} as const

const DURATION = 6500

export function HeroSlider({ locale }: { locale: Locale }) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [cycle, setCycle] = useState(0)
  const items = slides[locale]
  const current = items[index]

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      setIndex(value => (value + 1) % items.length)
      setCycle(value => value + 1)
    }, DURATION)
    return () => window.clearTimeout(timer)
  }, [playing, index, cycle, items.length])

  function select(next: number) {
    setIndex(next)
    setCycle(value => value + 1)
  }

  return <section className="hero hero--slider" aria-label={locale === 'uk' ? 'Головний слайдер' : 'Main carousel'}>
    <div className="hero-copy">
      <p className="eyebrow">{current.eyebrow}</p>
      <h1 id="hero-title">{current.lines.map((line, i) => <span key={i}>{line}{i < 2 && <br />}</span>)}</h1>
      <p>{current.description}</p>
      <div className="hero-actions">
        <Link className="cta" href={`/${locale}/booking`}>{locale === 'uk' ? 'Записатися онлайн' : 'Book online'} →</Link>
        <a className="hero-secondary" href="#services">{locale === 'uk' ? 'Наші послуги' : 'Our services'}</a>
      </div>
      <div className="hero-slider-controls" aria-label={locale === 'uk' ? 'Керування слайдами' : 'Slide controls'}>
        <span className="hero-slide-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="hero-slide-progress__track" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={3} aria-label={locale === 'uk' ? 'Поточний слайд' : 'Current slide'}>
          <span key={cycle} className={`hero-slide-progress__fill${playing ? ' is-playing' : ''}`} />
        </div>
        <span className="hero-slide-number">03</span>
        <button type="button" className="hero-slider-pause" aria-label={playing ? (locale === 'uk' ? 'Зупинити слайдер' : 'Pause slideshow') : (locale === 'uk' ? 'Відновити слайдер' : 'Resume slideshow')} onClick={() => { setPlaying(value => !value); setCycle(value => value + 1) }}>{playing ? 'Ⅱ' : '▶'}</button>
      </div>
    </div>
    <div className="hero-art"><Image src="/images/hero/barber-chair.png" alt={locale === 'uk' ? 'Класичне барберське крісло' : 'Classic barber chair'} width={1024} height={1400} className="hero-chair" priority sizes="(max-width: 720px) 90vw, 42vw" /></div>
    <div className="hero-slide-dots" aria-label={locale === 'uk' ? 'Обрати слайд' : 'Choose slide'}>{items.map((_, i) => <button key={i} type="button" aria-label={`${locale === 'uk' ? 'Слайд' : 'Slide'} ${i + 1}`} aria-current={index === i ? 'true' : undefined} onClick={() => select(i)} />)}</div>
    <a className="scroll-hint scroll-mouse" href="#about" aria-label={locale === 'uk' ? 'До наступної секції' : 'Next section'}><svg viewBox="0 0 32 48" width="32" height="48" fill="none" aria-hidden="true"><rect x="5" y="2" width="22" height="42" rx="11" stroke="currentColor" strokeWidth="1.5"/><path d="M16 11v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></a>
  </section>
}
