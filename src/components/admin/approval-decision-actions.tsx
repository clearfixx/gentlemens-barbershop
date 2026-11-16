'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ApprovalDecisionActions({ id, locale }: { id: number; locale: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const uk = locale === 'uk'

  async function decide(status: 'approved' | 'rejected') {
    if (busy) return
    if (status === 'rejected' && !reason.trim()) {
      setError(uk ? 'Вкажіть причину відхилення' : 'Enter a rejection reason')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/commercial-requests/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Заявка змінилася. Оновіть сторінку.' : 'Proposal changed. Refresh the page.')
          : (uk ? 'Не вдалося виконати дію' : 'Unable to complete this action'))
        return
      }
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання' : 'Network error')
    } finally {
      setBusy(false)
    }
  }
  return <div className="management-decision">
    <label htmlFor={`reason-${id}`}>{uk ? 'Причина / коментар' : 'Reason / comment'}</label>
    <input id={`reason-${id}`} value={reason} maxLength={1000}
      onChange={event => setReason(event.target.value)}
      placeholder={uk ? 'Обов’язкова для відхилення' : 'Required for rejection'} />
    <div className="management-decision__actions">
      <button type="button" disabled={busy} onClick={() => decide('approved')}>
        {uk ? 'Схвалити' : 'Approve'}
      </button>
      <button className="management-decision__reject" type="button"
        disabled={busy} onClick={() => decide('rejected')}>
        {uk ? 'Відхилити' : 'Reject'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>
}
