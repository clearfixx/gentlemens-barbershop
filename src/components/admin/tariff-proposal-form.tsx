'use client'

import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useState } from 'react'

export type TariffOfferingOption = {
  locationId: number
  barberId: number
  serviceId: number
  label: string
}

export function TariffProposalForm({ locale, offerings }: {
  locale: string
  offerings: TariffOfferingOption[]
}) {
  const router = useRouter()
  const uk = locale === 'uk'
  const [selected, setSelected] = useState(0)
  const [kind, setKind] = useState<'barber_price' | 'barber_duration'>('barber_price')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const chosen = offerings[selected]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen || busy) return
    const proposedValue = Number(value)
    if (!Number.isSafeInteger(proposedValue) || proposedValue < (kind === 'barber_price' ? 0 : 5) ||
        (kind === 'barber_duration' && proposedValue > 480)) {
      setSuccess(false)
      setMessage(uk ? 'Вкажіть коректне ціле значення' : 'Enter a valid integer amount')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/commercial-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: chosen.locationId,
          barberId: chosen.barberId,
          serviceId: chosen.serviceId,
          kind, proposedValue,
        }),
      })
      if (!response.ok) {
        setSuccess(false)
        setMessage(response.status === 403
          ? (uk ? 'Немає доступу до цього закладу' : 'No access to this location')
          : (uk ? 'Заявку не створено. Перевірте поточний тариф.' : 'Proposal not created. Check the current tariff.'))
        return
      }
      setValue('')
      setSuccess(true)
      setMessage(uk ? 'Заявку надіслано на погодження' : 'Request submitted for approval')
      router.refresh()
    } catch {
      setSuccess(false)
      setMessage(uk ? 'Помилка з’єднання' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return <section className="management-panel management-proposal" aria-labelledby="proposal-title">
    <h2 id="proposal-title">{uk ? 'Нова заявка на зміну тарифу' : 'New tariff proposal'}</h2>
    {offerings.length === 0
      ? <p className="management-empty">{uk ? 'Для ваших закладів поки немає доступних пропозицій майстрів.'
        : 'No barber offerings are available for your assigned locations.'}</p>
      : <form onSubmit={submit}>
        <label>{uk ? 'Майстер і послуга' : 'Barber and service'}
          <select value={selected} onChange={e => setSelected(Number(e.target.value))}>
            {offerings.map((offering, index) => <option key={`${offering.barberId}-${offering.serviceId}`} value={index}>
              {offering.label}
            </option>)}
          </select>
        </label>
        <label>{uk ? 'Що змінити' : 'Change'}
          <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option value="barber_price">{uk ? 'Ціна (грн)' : 'Price (UAH)'}</option>
            <option value="barber_duration">{uk ? 'Тривалість (хв)' : 'Duration (min)'}</option>
          </select>
        </label>
        <label>{uk ? 'Нове значення' : 'Proposed amount'}
          <input inputMode="numeric" type="number" step="1"
            min={kind === 'barber_price' ? 0 : 5}
            max={kind === 'barber_duration' ? 480 : undefined}
            required value={value} onChange={e => setValue(e.target.value)}/>
        </label>
        <button type="submit" disabled={busy}>{busy
          ? (uk ? 'Надсилання…' : 'Submitting…')
          : (uk ? 'Надіслати заявку' : 'Submit proposal')}</button>
      </form>}
    {message && <p role="status" className={success ? 'management-success' : 'management-error'}>{message}</p>}
  </section>
}
