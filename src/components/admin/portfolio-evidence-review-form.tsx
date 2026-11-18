'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Outcome = 'needs_evidence' | 'evidence_reviewed' | 'rejected'

/** Explicit manual review, NOT an approval to publish to the public site. */
export function PortfolioEvidenceReviewForm({
  revisionId, mediaId, locale,
}: { revisionId: number; mediaId: number; locale: string }) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [outcome, setOutcome] = useState<Outcome>('needs_evidence')
  const [rightsReference, setRightsReference] = useState('')
  const [consentReference, setConsentReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function record() {
    if (busy || !note.trim() ||
        (outcome === 'evidence_reviewed' && (!rightsReference.trim() || !consentReference.trim()))) {
      setError(uk ? 'Потрібні пояснення та, для перевірених матеріалів, обидва посилання.' :
        'An explanation and both references are required for evidence reviewed.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/professional-reviews/${revisionId}/private-media/${mediaId}/evidence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outcome, note: note.trim(),
            ...(rightsReference.trim() ? { rightsReference: rightsReference.trim() } : {}),
            ...(consentReference.trim() ? { consentReference: consentReference.trim() } : {}),
          }),
        },
      )
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Заявка змінилася. Оновіть сторінку.' : 'Proposal changed. Refresh the page.')
          : (uk ? 'Не вдалося зберегти рішення.' : 'Could not record the review.'))
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
  return <div className="management-evidence-form">
    <label>{uk ? 'Результат перевірки матеріалів' : 'Evidence review outcome'}
      <select value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}>
        <option value="needs_evidence">{uk ? 'Потрібні підтвердження' : 'More evidence needed'}</option>
        <option value="evidence_reviewed">{uk ? 'Матеріали перевірено' : 'Evidence reviewed'}</option>
        <option value="rejected">{uk ? 'Відхилити матеріали' : 'Reject evidence'}</option>
      </select>
    </label>
    <label>{uk ? 'ID підтвердження прав' : 'Rights document reference'}
      <input maxLength={256} value={rightsReference}
        onChange={event => setRightsReference(event.target.value)}
        placeholder="rights:record-123"/>
    </label>
    <label>{uk ? 'ID підтвердження згоди' : 'Consent document reference'}
      <input maxLength={256} value={consentReference}
        onChange={event => setConsentReference(event.target.value)}
        placeholder="consent:record-123"/>
    </label>
    <label>{uk ? 'Коментар модератора' : 'Reviewer explanation'}
      <textarea rows={2} maxLength={1000} value={note}
        onChange={event => setNote(event.target.value)}/>
    </label>
    <button type="button" onClick={record} disabled={busy}>
      {busy ? (uk ? 'Збереження…' : 'Saving…') :
        (uk ? 'Записати перевірку' : 'Record evidence review')}
    </button>
    {error && <p role="alert" className="management-error">{error}</p>}
  </div>
}
