'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Locale } from '@/i18n/config'
import { getFallbackMessages } from '@/i18n/messages'

type Messages = ReturnType<typeof getFallbackMessages>
const INTERVAL = 7000

export function HeroSlider({ locale, messages }: { locale: Locale; messages: Messages }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(true)
  const progressRef = useRef<HTMLSpanElement>(null)

  const elapsedRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const slides = [
    { eyebrow: messages.home.eyebrow, title: [messages.home.heroLine1, messages.home.heroLine2], accent: messages.home.heroAccent, description: messages.home.heroIntro },
    { eyebrow: messages.home.philosophyEyebrow, title: [messages.home.philosophyTitle], accent: '', description: messages.home.philosophyIntro },
    { eyebrow: messages.home.finalEyebrow, title: [messages.home.finalTitle], accent: '', description: messages.home.finalIntro },
  ]

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden)
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const playing = !paused && !hovered && !focused && !reducedMotion && visible

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null
      return
    }
    let frame = 0
    const tick = (now: number) => {
      if (lastTickRef.current !== null) elapsedRef.current += Math.min(now - lastTickRef.current, 100)
      lastTickRef.current = now
      if (elapsedRef.current >= INTERVAL) {
        elapsedRef.current %= INTERVAL
        setActive(current => (current + 1) % slides.length)
      }
      progressRef.current?.style.setProperty('transform', `scaleX(${elapsedRef.current / INTERVAL})`)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
      lastTickRef.current = null
    }
  }, [playing, slides.length])

  const chooseSlide = (index: number) => {
    elapsedRef.current = 0
    progressRef.current?.style.setProperty('transform', 'scaleX(0)')
    setActive(index)
  }


  const slide = slides[active]
  return (
    <div className="hero-scene">
    <section className="hero hero--editorial hero--slider hero--photographic" aria-labelledby="hero-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <div className="hero-photo" aria-hidden="true" />
      <div className="hero-copy hero-copy--reveal">
        <p className="eyebrow hero-enter hero-enter--eyebrow">{slide.eyebrow}</p>
        <h1 id="hero-title" key={active} className="hero-enter hero-enter--title">{slide.title.map((line, index) => <span key={index}>{line}<br /></span>)}{slide.accent && <em>{slide.accent}</em>}</h1>
        <p className="hero-enter hero-enter--description">{slide.description}</p>
        <div className="hero-actions hero-enter hero-enter--actions"><Link className="cta" href={`/${locale}/booking`}>{messages.actions.planVisit}</Link><a href="#about">{messages.home.learnMore} ↗</a></div>
        <div className="hero-slider__controls hero-enter hero-enter--controls" aria-label={locale === 'uk' ? 'Керування слайдером' : 'Slider controls'}>
          {slides.map((_, index) => <button key={index} type="button" className={index === active ? 'is-active' : ''} aria-label={locale === 'uk' ? `Слайд ${index + 1}` : `Slide ${index + 1}`} aria-current={index === active ? 'true' : undefined} onClick={() => chooseSlide(index)}><span>{String(index + 1).padStart(2, '0')}</span></button>)}
          <button type="button" className="hero-slider__progress hero-slider__progress-toggle" aria-label={paused ? (locale === 'uk' ? 'Відновити автоматичне перемикання' : 'Resume automatic slides') : (locale === 'uk' ? 'Зупинити автоматичне перемикання' : 'Pause automatic slides')} aria-pressed={paused} onClick={() => setPaused(value => !value)}><span ref={progressRef} /></button>
        </div>
      </div>
      <div className="hero-chair hero-chair--enter" role="img" aria-label={messages.home.heroArtLabel} />
      <a className="scroll-hint scroll-mouse hero-enter hero-enter--scroll" href="#about" aria-label={messages.home.scrollLabel}><svg viewBox="0 0 32 48" width="32" height="48" fill="none" aria-hidden="true"><rect x="5" y="2" width="22" height="42" rx="11" stroke="currentColor" strokeWidth="1.5"/><path d="M16 11v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></a>
    </section>
    </div>
  )
}
