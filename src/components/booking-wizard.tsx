'use client'

import { useEffect, useMemo, useState } from 'react'

type Location = { id: number; name: string; city: string }
type Service = { id: number; name: string }
type Barber = { id: number; name: string; locationId: number; serviceIds: number[] }
type Slot = { startsAt: string; endsAt: string }
type Availability = { timeZone: string; price: number; durationMinutes: number; slots: Slot[] }

export function BookingWizard({ locations, barbers, services, today, maxDate }: {
  locations: Location[]; barbers: Barber[]; services: Service[]; today: string; maxDate: string
}) {
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
        if (!response.ok) throw new Error(response.status === 429 ? 'Забагато запитів. Спробуйте трохи пізніше.' : 'Не вдалося перевірити доступність.')
        const data = await response.json() as Availability
        if (active) setAvailability(data)
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Помилка завантаження')
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => { active = false; controller.abort() }
  }, [barberId, serviceId, date])

  const resetAvailability = () => { setAvailability(null); setSelectedSlot(''); setError(''); setLoading(false) }
  const stepNames = ['Локація', 'Майстер', 'Послуга', 'Дата й час', 'Підсумок']
  const canContinue = [locationId > 0, barberId > 0, serviceId > 0, Boolean(selectedSlot && availability?.slots.some(slot => slot.startsAt === selectedSlot)), false][step]
  const formatTime = (value: string, timeZone: string) => new Intl.DateTimeFormat('uk-UA', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))

  return <section className="booking-wizard" aria-label="Планування запису">
    <ol className="booking-progress">{stepNames.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-current' : ''}>{index + 1}. {name}</li>)}</ol>
    <div className="booking-panel">
      <p className="eyebrow">Крок {step + 1} із 5</p>
      <h2>{stepNames[step]}</h2>
      {step === 0 && <div className="booking-options">{locations.map(item => <button type="button" className={locationId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setLocationId(item.id); setBarberId(0); setServiceId(0); setDate(''); resetAvailability() }}>{item.name}<small>{item.city}</small></button>)}</div>}
      {step === 1 && <div className="booking-options">{eligibleBarbers.map(item => <button type="button" className={barberId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setBarberId(item.id); setServiceId(0); setDate(''); resetAvailability() }}>{item.name}</button>)}</div>}
      {step === 2 && <div className="booking-options">{eligibleServices.map(item => <button type="button" className={serviceId === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setServiceId(item.id); setDate(''); resetAvailability() }}>{item.name}</button>)}</div>}
      {step === 3 && <>
        <label className="booking-date">Оберіть дату <input type="date" value={date} min={today} max={maxDate} onChange={event => { resetAvailability(); setDate(event.target.value); if (event.target.value) setLoading(true) }} /></label>
        {loading && <p role="status">Шукаємо вільний час…</p>}
        {error && <p role="alert">{error}</p>}
        {availability && <><p>Тривалість: {availability.durationMinutes} хв · Вартість: {availability.price} грн</p>
          {availability.slots.length ? <div className="booking-slots">{availability.slots.map(slot => <button type="button" key={slot.startsAt} className={selectedSlot === slot.startsAt ? 'is-selected' : ''} onClick={() => setSelectedSlot(slot.startsAt)}>{formatTime(slot.startsAt, availability.timeZone)}</button>)}</div> : <p>На цю дату вільних годин немає.</p>}
        </>}
      </>}
      {step === 4 && <div className="booking-summary">
        <p><strong>Локація:</strong> {locations.find(item => item.id === locationId)?.name}</p>
        <p><strong>Майстер:</strong> {selectedBarber?.name}</p>
        <p><strong>Послуга:</strong> {services.find(item => item.id === serviceId)?.name}</p>
        <p><strong>Дата:</strong> {date}</p>
        <p><strong>Час:</strong> {availability && formatTime(selectedSlot, availability.timeZone)}</p>
        <p><strong>Вартість:</strong> {availability?.price} грн</p>
        <div className="booking-contact">
          <h3>Контактні дані</h3>
          <p className="catalog-intro">Можна попередньо заповнити форму. Дані залишаються лише в цьому вікні браузера та не надсилаються на сервер.</p>
          <label>Ваше ім’я <input type="text" autoComplete="name" maxLength={120} value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Ім’я та прізвище" /></label>
          <label>Телефон <input type="tel" autoComplete="tel" maxLength={24} value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="+380…" /></label>
          <label>Email (необов’язково) <input type="email" autoComplete="email" maxLength={254} value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="you@example.com" /></label>
        </div>
        <p className="catalog-notice" role="status">Запис ще не створено. Відправлення контактних даних та підтвердження бронювання поки вимкнені.</p>
      </div>}
      <div className="booking-actions">
        {step > 0 && <button type="button" className="booking-back" onClick={() => setStep(value => value - 1)}>Назад</button>}
        {step < 4 && <button type="button" className="cta" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Продовжити</button>}
      </div>
    </div>
  </section>
}
