'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ProfessionalRejectForm({ id, locale }: { id: number; locale: string }) {
  const router = useRouter()
  const uk = locale === 'uk'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function reject() {
    if (busy) return
    if (!reason.trim()) {
      setError(uk ? 'Вкажіть причину відхилення.' : 'Provide a rejection reason.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/professional-reviews/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Заявка вже змінилася. Оновіть сторінку.' : 'Review changed. Refresh the page.')
          : (uk ? 'Не вдалося відхилити заявку.' : 'Unable to reject the review.'))
        return
      }
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }
  return <section className="management-panel management-booking-results" aria-labelledby="professional-reject-title">
    <h2 id="professional-reject-title">{uk ? 'Відхилити заявку' : 'Reject proposal'}</h2>
    <p className="management-booking-note">{uk
      ? 'Рішення буде записано в історії заявки. Опубліковані дані барбера не зміняться.'
      : 'The decision will be recorded. Published barber data will not change.'}</p>
    <label className="management-review-reject-label">
      {uk ? 'Причина відхилення' : 'Rejection reason'}
      <textarea required maxLength={1000} value={reason}
        onChange={event => setReason(event.target.value)}
        rows={3} placeholder={uk ? 'Що потрібно виправити?' : 'What needs to be corrected?'}/>
    </label>
    <button type="button" className="management-review-reject-button"
      disabled={busy} onClick={reject}>
      {busy ? (uk ? 'Збереження…' : 'Saving…') : (uk ? 'Відхилити заявку' : 'Reject proposal')}
    </button>
    {error && <p role="alert" className="management-error">{error}</p>}
  </section>
}
