'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Kind = 'consent_concern' | 'rights_concern' | 'safety_concern'

/** Precautionary hold is not verification of the reporter or a legal ruling. */
export function PortfolioMediaHoldForm({ revisionId, mediaId, locale }: {
  revisionId: number; mediaId: number; locale: string
}) {
  const router = useRouter()
  const uk = locale === 'uk'
  const [kind, setKind] = useState<Kind>('consent_concern')
  const [caseReference, setCaseReference] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    if (busy) return
    if (!caseReference.trim() || reason.trim().length < 5) {
      setError(uk ? 'Вкажіть номер справи та пояснення.' : 'Provide a case ID and explanation.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/professional-reviews/${revisionId}/private-media/${mediaId}/hold`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, caseReference: caseReference.trim(), reason: reason.trim() }),
        },
      )
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Матеріал уже заблокований або змінився.' : 'Material already held or changed.')
          : (uk ? 'Не вдалося поставити блокування.' : 'Could not place hold.'))
        return
      }
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="management-evidence-form">
    <strong>{uk ? 'Запобіжне блокування фотографії' : 'Precautionary photo hold'}</strong>
    <p>{uk ? 'Підозра або звернення: це ще не підтверджене відкликання згоди.' :
      'A concern or report, not a verified consent withdrawal.'}</p>
    <label>{uk ? 'Причина' : 'Concern'}
      <select value={kind} onChange={event => setKind(event.target.value as Kind)}>
        <option value="consent_concern">{uk ? 'Згода клієнта' : 'Client consent'}</option>
        <option value="rights_concern">{uk ? 'Авторські права' : 'Usage rights'}</option>
        <option value="safety_concern">{uk ? 'Безпека / конфіденційність' : 'Safety / privacy'}</option>
      </select>
    </label>
    <label>{uk ? 'Внутрішній номер справи (без персональних даних)' : 'Internal case reference (no personal data)'}
      <input value={caseReference} maxLength={256}
        onChange={event => setCaseReference(event.target.value)} placeholder="case:2026-0001"/>
    </label>
    <label>{uk ? 'Пояснення' : 'Explanation'}
      <textarea rows={2} maxLength={1000} value={reason}
        onChange={event => setReason(event.target.value)}/>
    </label>
    <button type="button" disabled={busy} onClick={submit}>
      {busy ? (uk ? 'Блокування…' : 'Applying hold…') :
        (uk ? 'Заблокувати матеріал' : 'Place precautionary hold')}
    </button>
    {error && <p role="alert" className="management-error">{error}</p>}
  </div>
}
