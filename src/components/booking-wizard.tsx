'use client'

import Link from 'next/link'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getFallbackMessages } from '@/i18n/messages'
import { type Locale } from '@/i18n/config'
import { bookingLocalDateWindow, isBookingWizardAvailability, isBookingWizardReceipt, type BookingWizardAvailability } from '@/lib/booking/booking-wizard-contract'

type Location = { id: number; name: string; city: string; timeZone: string }
type Service = { id: number; name: string }
type Barber = { id: number; name: string; locationId: number; serviceIds: number[] }
export function BookingWizard({
  locations, barbers, services, nowIso, locale, messages, bookingEnabled = false, initialContact,
}: {
  locations: Location[]
  barbers: Barber[]
  services: Service[]
  nowIso: string
  initialContact?: { name: string; email: string }
  locale: Locale
  messages?: ReturnType<typeof getFallbackMessages>
  bookingEnabled?: boolean
}) {
  const t = messages ?? getFallbackMessages(locale)
  const [step, setStep] = useState(0)
  const [locationId, setLocationId] = useState(0)
  const [barberId, setBarberId] = useState(0)
  const [serviceIds, setServiceIds] = useState<number[]>([])
  const [date, setDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availability, setAvailability] = useState<BookingWizardAvailability | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<{ id: number; replayed: boolean } | null>(null)
  const [error, setError] = useState('')
  const [customerName, setCustomerName] = useState(initialContact?.name ?? '')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState(initialContact?.email ?? '')
  const retryKey = useRef<string | null>(null)
  const eligibleBarbers = useMemo(() => barbers.filter(item => item.locationId === locationId), [barbers, locationId])
  const selectedBarber = barbers.find(item => item.id === barberId)
  const selectedLocation = locations.find(item => item.id === locationId)
  const localWindow = selectedLocation ? bookingLocalDateWindow(nowIso, selectedLocation.timeZone) : null
  const eligibleServices = services.filter(item => selectedBarber?.serviceIds.includes(item.id))
  const rateLimitedMessage = t.booking.rateLimited
  const unavailableMessage = t.booking.unavailable

  useEffect(() => {
    if (!barberId || !serviceIds.length || !date) return
    const controller = new AbortController()
    let active = true
    const query = new URLSearchParams({ barber: String(barberId), date })
    serviceIds.forEach(id => query.append('service', String(id)))
    const run = async () => {
      try {
        const response = await fetch(`/api/availability?${query.toString()}`, {
          signal: controller.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error(response.status === 429 ? rateLimitedMessage : unavailableMessage)
        const data: unknown = await response.json()
        if (!isBookingWizardAvailability(data, { barberId, locationId, serviceIds, date })) {
          throw new Error(unavailableMessage)
        }
        if (active) setAvailability(data)
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : unavailableMessage)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => { active = false; controller.abort() }
  }, [barberId, locationId, serviceIds, date, rateLimitedMessage, unavailableMessage])

  const resetAvailability = () => {
    setAvailability(null)
    setSelectedSlot('')
    setError('')
    setLoading(false)
    retryKey.current = null
  }
  const resetContactError = () => {
    setError('')
    retryKey.current = null
  }
  const slotsReady = Boolean(
    selectedSlot && availability?.slots.some(slot => slot.startsAt === selectedSlot),
  )
  const canContinue = [
    locationId > 0, barberId > 0, serviceIds.length > 0, slotsReady, false,
  ][step]
  const canSubmit = bookingEnabled && slotsReady && !submitting &&
    customerName.trim().length > 0 && customerPhone.trim().length >= 7
  const formatTime = (value: string, timeZone: string) => new Intl.DateTimeFormat(
    locale === 'uk' ? 'uk-UA' : 'en-GB',
    { timeZone, hour: '2-digit', minute: '2-digit' },
  ).format(new Date(value))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !availability) return
    setSubmitting(true)
    setError('')
    const key = retryKey.current ?? crypto.randomUUID()
    retryKey.current = key
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          locationId, barberId, serviceIds, startsAt: selectedSlot,
          customerName: customerName.trim(), customerPhone: customerPhone.trim(),
          ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        }),
      })
      if (!response.ok) {
        if (response.status === 409) {
          resetAvailability()
          setDate('')
          setStep(3)
          setError(t.booking.slotChanged)
        } else {
          setError(response.status === 429 ? rateLimitedMessage :
            response.status === 503 ? t.booking.noSubmit :
              response.status === 400 ? t.booking.invalidContact :
                response.status === 403 ? t.booking.contactMismatch :
                  t.booking.submitFailed)
        }
        return
      }
      const result: unknown = await response.json()
      if (!isBookingWizardReceipt(result)) {
        throw new Error(t.booking.submitFailed)
      }
      setReceipt(result)
    } catch {
      // Keep the same retry key after a network failure: the server may have
      // committed the first request even if its response was lost.
      setError(t.booking.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return <section className="booking-wizard" aria-label={t.nav.booking}>
    {receipt ? <div className="booking-panel" role="status">
      <h2>{t.booking.successTitle}</h2>
      <p>{t.booking.successIntro}</p>
      <p><strong>{t.booking.reference}: {receipt.id}</strong></p>
      <p>{locations.find(item => item.id === locationId)?.name} · {selectedBarber?.name}</p>
      <p>{date} · {availability && formatTime(selectedSlot, availability.timeZone)}</p>
      <p>{t.booking.confirmationNote}</p>
      {!initialContact && customerEmail.trim() && <Link className="catalog-inline-link"
        href={`/${locale}/booking/cancel?bookingId=${receipt.id}`}>
        {t.guestCancellation.title}
      </Link>}
    </div> : <>
      <ol className="booking-progress">{t.booking.steps.map((name, index) =>
        <li key={name} aria-current={step === index ? 'step' : undefined}
          className={step === index ? 'is-current' : ''}>{index + 1}. {name}</li>)}</ol>
      <form className="booking-panel" onSubmit={submit}>
        <p className="eyebrow">{t.booking.step} {step + 1} {t.booking.of} 5</p>
        <h2>{t.booking.steps[step]}</h2>
        {step === 0 && <div className="booking-options">{locations.map(item =>
          <button type="button" aria-pressed={locationId === item.id}
            className={locationId === item.id ? 'is-selected' : ''} key={item.id}
            onClick={() => {
              setLocationId(item.id); setBarberId(0); setServiceIds([])
              setDate(''); resetAvailability()
            }}>{item.name}<small>{item.city}</small></button>)}</div>}
        {step === 1 && <div className="booking-options">{eligibleBarbers.map(item =>
          <button type="button" aria-pressed={barberId === item.id}
            className={barberId === item.id ? 'is-selected' : ''} key={item.id}
            onClick={() => {
              setBarberId(item.id); setServiceIds([]); setDate(''); resetAvailability()
            }}>{item.name}</button>)}</div>}
        {step === 2 && <div className="booking-options" role="group" aria-label={t.booking.steps[2]}>
          {eligibleServices.map(item => {
            const selected = serviceIds.includes(item.id)
            return <button type="button" aria-pressed={selected}
              className={selected ? 'is-selected' : ''} key={item.id}
              onClick={() => {
                if (!selected && serviceIds.length >= 10) return
                setServiceIds(current => selected
                  ? current.filter(id => id !== item.id) : [...current, item.id])
                setDate(''); resetAvailability()
              }}>{item.name}</button>
          })}
        </div>}
        {step === 3 && <>
          <label className="booking-date">{t.booking.date}
            <input type="date" value={date} min={localWindow?.today} max={localWindow?.maxDate}
              onChange={event => {
                resetAvailability(); setDate(event.target.value)
                if (event.target.value) setLoading(true)
              }} /></label>
          {loading && <p role="status">{t.booking.loading}</p>}
          {availability && <>
            <p>{t.common.duration}: {availability.durationMinutes} {t.common.minuteShort} · {t.common.price}: {availability.price} {t.common.currency}</p>
            {availability.slots.length ? <div className="booking-slots">
              {availability.slots.map(slot => <button type="button"
                aria-pressed={selectedSlot === slot.startsAt} key={slot.startsAt}
                className={selectedSlot === slot.startsAt ? 'is-selected' : ''}
                onClick={() => { setSelectedSlot(slot.startsAt); resetContactError() }}>
                {formatTime(slot.startsAt, availability.timeZone)}
              </button>)}</div> : <p>{t.booking.empty}</p>}
          </>}
        </>}
        {step === 4 && <div className="booking-summary">
          <p><strong>{t.booking.steps[0]}:</strong> {locations.find(item => item.id === locationId)?.name}</p>
          <p><strong>{t.booking.steps[1]}:</strong> {selectedBarber?.name}</p>
          <p><strong>{t.booking.steps[2]}:</strong> {services.filter(item => serviceIds.includes(item.id)).map(item => item.name).join(', ')}</p>
          <p><strong>{t.availability.date}:</strong> {date}</p>
          <p><strong>{t.booking.time}:</strong> {availability && formatTime(selectedSlot, availability.timeZone)}</p>
          <p><strong>{t.common.price}:</strong> {availability?.price} {t.common.currency}</p>
          <div className="booking-contact">
            <h3>{t.booking.contact}</h3>
            <p className="catalog-intro">{t.booking.contactIntro}</p>
            <label>{t.booking.name}
              <input type="text" autoComplete="name" required maxLength={120}
                value={customerName} onChange={event => { setCustomerName(event.target.value); resetContactError() }}
                placeholder={t.booking.namePlaceholder} /></label>
            <label>{t.booking.phone}
              <input type="tel" autoComplete="tel" required maxLength={24} minLength={7}
                value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); resetContactError() }}
                placeholder="+380…" /></label>
            <label>{t.booking.email}
              <input type="email" autoComplete="email" maxLength={254}
                value={customerEmail} onChange={event => { setCustomerEmail(event.target.value); resetContactError() }}
                placeholder="you@example.com" /></label>
          </div>
          {!bookingEnabled && <p className="catalog-notice" role="status">{t.booking.noSubmit}</p>}
        </div>}
        {error && <p role="alert" className="catalog-notice">{error}</p>}
        <div className="booking-actions">
          {step > 0 && <button type="button" className="booking-back" disabled={submitting}
            onClick={() => { setStep(value => value - 1); setError('') }}>{t.actions.back}</button>}
          {step < 4
            ? <button type="button" className="cta" disabled={!canContinue}
                onClick={() => setStep(value => value + 1)}>{t.actions.continue}</button>
            : <button type="submit" className="cta" disabled={!canSubmit}>
                {submitting ? t.booking.submitting : t.booking.confirm}
              </button>}
        </div>
      </form>
    </>}
  </section>
}
