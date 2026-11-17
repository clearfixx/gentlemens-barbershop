'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Outcome = 'review_complete' | 'returned_for_evidence'
export function PortfolioSignoffForm({ revisionId, locale, completeEvidence }: {
  revisionId: number; locale: string; completeEvidence: boolean
}) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [outcome, setOutcome] = useState<Outcome>(
    completeEvidence ? 'review_complete' : 'returned_for_evidence',
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    if (busy) return
    if (note.trim().length < 5) {
      setError(uk ? 'Додайте пояснення (не менш як 5 символів).' : 'Add an explanation (at least 5 characters).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/professional-reviews/${revisionId}/portfolio-signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, note: note.trim() }),
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Склад заявки або перевірки змінився. Оновіть сторінку.' :
            'The submission or evidence changed. Refresh the page.')
          : (uk ? 'Не вдалося записати рішення.' : 'Could not record the decision.'))
        return
      }
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }
  return <section className="management-panel management-signoff-panel">
    <h2>{uk ? 'Завершення перевірки документів' : 'Documentation review signoff'}</h2>
    <p className="management-booking-note">{uk
      ? 'Це внутрішнє адміністративне рішення. Воно не публікує фотографії та не підтверджує юридичну допустимість їх використання.'
      : 'This is an internal administrative decision. It does not publish photos or establish legal permission to use them.'}</p>
    <div className="management-evidence-form">
      <label>{uk ? 'Рішення' : 'Decision'}
        <select value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}>
          <option value="returned_for_evidence">{uk ? 'Повернути на уточнення' : 'Return for more evidence'}</option>
          <option value="review_complete" disabled={!completeEvidence}>
            {uk ? 'Завершити перевірку документів' : 'Complete documentation review'}
          </option>
        </select>
      </label>
      <label>{uk ? 'Пояснення адміністратора' : 'Administrator explanation'}
        <textarea maxLength={1000} rows={3} value={note}
          onChange={event => setNote(event.target.value)}/>
      </label>
      <button type="button" disabled={busy} onClick={submit}>
        {busy ? (uk ? 'Збереження…' : 'Saving…') :
          (uk ? 'Зафіксувати рішення' : 'Record decision')}
      </button>
      {error && <p role="alert" className="management-error">{error}</p>}
    </div>
  </section>
}
