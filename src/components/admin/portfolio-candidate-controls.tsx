'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function PortfolioCandidateControls({
  revisionId, locale, candidates, canPrepare,
}: {
  revisionId: number
  locale: string
  canPrepare: boolean
  candidates: Array<{ id: number; mediaId: number; status: 'prepared' | 'withdrawn' }>
}) {
  const router = useRouter()
  const uk = locale === 'uk'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function act(path: string) {
    if (busy) return
    if (note.trim().length < 5) {
      setError(uk ? 'Вкажіть причину (від 5 символів).' : 'Provide a reason (5 characters minimum).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: note.trim() }),
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Дані змінилися або операція вже виконана. Оновіть сторінку.' :
            'The review changed or this action is complete. Refresh.')
          : (uk ? 'Не вдалося зберегти рішення.' : 'Could not record the decision.'))
        return
      }
      setNote('')
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }
  return <section className="management-panel">
    <h2>{uk ? 'Кандидати портфоліо (приватно)' : 'Private portfolio candidates'}</h2>
    <p className="management-booking-note">{uk
      ? 'Підготовка не публікує фотографії. Усі матеріали залишаються приватними; кандидат може бути відкликаний.'
      : 'Preparation never publishes photos. All assets remain private and candidates may be withdrawn.'}</p>
    {candidates.length > 0 && <div className="management-candidate-list">
      {candidates.map(candidate => <div key={candidate.id} className="management-candidate-row">
        <span>{uk ? 'Фото' : 'Photo'} #{candidate.mediaId}</span>
        <span>{candidate.status === 'withdrawn'
          ? (uk ? 'Відкликано' : 'Withdrawn')
          : (uk ? 'Підготовлено приватно' : 'Prepared privately')}</span>
        {candidate.status === 'prepared' && <button type="button" disabled={busy}
          onClick={() => act(`/api/admin/private-portfolio-candidates/${candidate.id}/withdraw`)}>
          {uk ? 'Відкликати' : 'Withdraw'}
        </button>}
      </div>)}
    </div>}
    <label className="management-candidate-note">
      {uk ? 'Обов’язкове пояснення рішення' : 'Required decision explanation'}
      <textarea rows={2} maxLength={1000} value={note}
        onChange={event => setNote(event.target.value)}/>
    </label>
    {canPrepare && candidates.length === 0 && <button type="button" disabled={busy}
      className="management-candidate-prepare"
      onClick={() => act(`/api/admin/professional-reviews/${revisionId}/private-candidates`)}>
      {busy ? (uk ? 'Збереження…' : 'Saving…') :
        (uk ? 'Підготувати приватні кандидати' : 'Prepare private candidates')}
    </button>}
    {error && <p role="alert" className="management-error">{error}</p>}
  </section>
}
