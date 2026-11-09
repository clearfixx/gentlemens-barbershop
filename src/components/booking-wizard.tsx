'use client'

import { useEffect, useMemo, useState } from 'react'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'

type Location = { id: number; name: string; city: string }
type Service = { id: number; name: string }
type Barber = { id: number; name: string; locationId: number; serviceIds: number[] }
type Slot = { startsAt: string; endsAt: string }
type Availability = { timeZone: string; price: number; durationMinutes: number; slots: Slot[] }

export function BookingWizard({ locations, barbers, services, today, maxDate, locale }: {
  locations: Location[]; barbers: Barber[]; services: Service[]; today: string; maxDate: string; locale: Locale
}) {
  const t = getFallbackMessages(locale)
  const [step, setStep] = useState(0)
  const [locationId, setLocationId] = useState(0)
  const [barberId, setBarberId] = useState(0)
  const [serviceId, setServiceId] = useState(0)
  const [date, setDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const eligibleBarbers = useMemo(() => barbers.filter(item => item.locationId === locationId), [barbers, locationId])
  const selectedBarber = barbers.find(item => item.id === barberId)
  const eligibleServices = services.filter(item => selectedBarber?.serviceIds.includes(item.id))

  useEffect(() => {
    if (!barberId || !serviceId || !date) return
    const controller = new AbortController()
    let active = true
    // An old response must never replace the slots for a newer selection.
    const run = async () => {
      try {
        const response = await fetch(`/api/availability?barber=${barberId}&service=${serviceId}&date=${date}`, {
          signal: controller.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error(response.status === 429 ? t.booking.rateLimited : t.booking.unavailable)
        const data = await response.json() as Availability
        if (active) setAvailability(data)
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : t.booking.unavailable)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => { active = false; controller.abort() }
  }, [barberId, serviceId, date])

  const resetAvailability = () => { setAvailability(null); setSelectedSlot(''); setError(''); setLoading(false) }
  const stepNames = t.booking.steps
  const canContinue = [locationId > 0, barberId > 0, serviceId > 0, Boolean(selectedSlot && availability?.slots.some(slot => slot.startsAt === selectedSlot)), false][step]
  const formatTime = (value: string, timeZone: string) => new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))

  return <section className="booking-wizard" aria-label={t.nav.booking}>
    <ol className="booking-progress">{stepNames.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-current' : ''}>{index + 1}. {name}</li>)}</ol>
    <div className="booking-panel">
      <p className="eyebrow">{t.booking.step} {step + 1} {t.booking.of} 5</p>
      <h2>{stepNames[step]}</h2>
      {step === 0 && <div className="booking-options">{locations.map(item => <button type="button" className={locationId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setLocationId(item.id); setBarberId(0); setServiceId(0); setDate(''); resetAvailability() }}>{item.name}<small>{item.city}</small></button>)}</div>}
      {step === 1 && <div className="booking-options">{eligibleBarbers.map(item => <button type="button" className={barberId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setBarberId(item.id); setServiceId(0); setDate(''); resetAvailability() }}>{item.name}</button>)}</div>}
      {step === 2 && <div className="booking-options">{eligibleServices.map(item => <button type="button" className={serviceId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setServiceId(item.id); setDate(''); resetAvailability() }}>{item.name}</button>)}</div>}
      {step === 3 && <>
        <label className="booking-date">{t.booking.date} <input type="date" value={date} min={today} max={maxDate} onChange={event => { resetAvailability(); setDate(event.target.value); if (event.target.value) setLoading(true) }} /></label>
        {loading && <p role="status">{t.booking.loading}</p>}
        {error && <p role="alert">{error}</p>}
        {availability && <><p>{t.common.duration}: {availability.durationMinutes} {t.common.minuteShort} · {t.common.price}: {availability.price} {t.common.currency}</p>
          {availability.slots.length ? <div className="booking-slots">{availability.slots.map(slot => <button type="button" key={slot.startsAt} className={selectedSlot === slot.startsAt ? 'is-selected' : ''} onClick={() => setSelectedSlot(slot.startsAt)}>{formatTime(slot.startsAt, availability.timeZone)}</button>)}</div> : <p>{t.booking.empty}</p>}
        </>}
      </>}
      {step === 4 && <div className="booking-summary">
        <p><strong>{t.booking.steps[0]}:</strong> {locations.find(item => item.id === locationId)?.name}</p>
        <p><strong>{t.booking.steps[1]}:</strong> {selectedBarber?.name}</p>
        <p><strong>{t.booking.steps[2]}:</strong> {services.find(item => item.id === serviceId)?.name}</p>
        <p><strong>{t.availability.date}:</strong> {date}</p>
        <p><strong>{t.booking.time}:</strong> {availability && formatTime(selectedSlot, availability.timeZone)}</p>
        <p><strong>{t.common.price}:</strong> {availability?.price} {t.common.currency}</p>
        <div className="booking-contact">
          <h3>{t.booking.contact}</h3>
          <p className="catalog-intro">{t.booking.contactIntro}</p>
          <label>{t.booking.name} <input type="text" autoComplete="name" maxLength={120} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder={t.booking.namePlaceholder} /></label>
          <label>{t.booking.phone} <input type="tel" autoComplete="tel" maxLength={24} value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="+380…" /></label>
          <label>{t.booking.email} <input type="email" autoComplete="email" maxLength={254} value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="you@example.com" /></label>
        </div>
        <p className="catalog-notice" role="status">{t.booking.noSubmit}</p>
      </div>}
      <div className="booking-actions">
        {step > 0 && <button type="button" className="booking-back" onClick={() => setStep(value => value - 1)}>{t.actions.back}</button>}
        {step < 4 && <button type="button" className="cta" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>{t.actions.continue}</button>}
      </div>
    </div>
  </section>
}
