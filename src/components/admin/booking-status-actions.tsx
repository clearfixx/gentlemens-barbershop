'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationalBookingStatus } from '@/lib/admin/operational-bookings'

type TargetStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show'

const nextStatuses: Record<OperationalBookingStatus, readonly TargetStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function BookingStatusActions({
  id, status, locale,
}: { id: number; status: OperationalBookingStatus; locale: string }) {
  const router = useRouter()
  const uk = locale === 'uk'
  const actions = nextStatuses[status]
  const [selected, setSelected] = useState<TargetStatus | ''>(actions[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const labels: Record<TargetStatus, string> = uk
    ? { confirmed: 'Підтвердити', completed: 'Завершити', no_show: 'Неявка', cancelled: 'Скасувати' }
    : { confirmed: 'Confirm', completed: 'Complete', no_show: 'No-show', cancelled: 'Cancel' }

  if (!actions.length) return null

  async function execute() {
    if (!selected || busy) return
    if ((selected === 'cancelled' || selected === 'no_show') &&
        !window.confirm(uk ? 'Підтвердити зміну статусу цього запису?' : 'Confirm this booking status change?')) {
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/admin/operational-bookings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selected }),
      })
      if (!response.ok) {
        setMessage(response.status === 409
          ? (uk ? 'Статус змінився або дія недоступна. Оновіть сторінку.' : 'Status changed or action unavailable. Refresh.')
          : response.status === 503
            ? (uk ? 'Зміни бронювань наразі вимкнені.' : 'Booking updates are currently disabled.')
            : (uk ? 'Не вдалося змінити статус.' : 'Unable to change status.'))
        return
      }
      router.refresh()
    } catch {
      setMessage(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="management-booking-action">
    <label>
      <span className="sr-only">{uk ? `Дія для запису #${id}` : `Action for booking #${id}`}</span>
      <select value={selected} disabled={busy}
        onChange={event => setSelected(event.target.value as TargetStatus)}>
        {actions.map(action => <option key={action} value={action}>{labels[action]}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy || !selected} onClick={execute}>
      {busy ? (uk ? 'Збереження…' : 'Saving…') : (uk ? 'Виконати' : 'Apply')}
    </button>
    {message && <p role="alert">{message}</p>}
  </div>
}
