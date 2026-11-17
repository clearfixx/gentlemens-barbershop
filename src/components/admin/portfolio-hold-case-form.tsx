'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { HoldCaseSummary, HoldCaseStage } from '@/lib/admin/portfolio-hold-cases'

export function PortfolioHoldCaseForm({ item, locale, currentAdminId }: {
  item: HoldCaseSummary; locale: string; currentAdminId: number
}) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [stage, setStage] = useState<HoldCaseStage>('investigating')
  const [assignedAdminId, setAssignedAdminId] = useState(
    String(item.assignedAdminId ?? currentAdminId))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (busy) return
    const id = Number(assignedAdminId)
    if (!Number.isSafeInteger(id) || id <= 0 || note.trim().length < 5) {
      setError(uk ? 'Вкажіть ID адміністратора й пояснення (від 5 символів).' :
        'Provide administrator ID and explanation (at least five characters).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/private-portfolio-hold-cases/${item.holdId}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, assignedAdminId: id, note: note.trim() }),
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Справу вже закрито або права адміністратора змінилися.' :
            'Case closed or administrator permissions changed.')
          : (uk ? 'Не вдалося записати етап розгляду.' : 'Could not record case stage.'))
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
  if (item.stage === 'closed_administratively') return null
  return <div className="management-evidence-form">
    <strong>{uk ? 'Розгляд справи про блокування' : 'Precautionary hold case review'}</strong>
    <p>{uk ? 'Адміністративне закриття справи не знімає блокування фото.' :
      'Administrative case closure never clears the photo hold.'}</p>
    <label>{uk ? 'Етап' : 'Case stage'}
      <select value={stage} onChange={event => setStage(event.target.value as HoldCaseStage)}>
        <option value="investigating">{uk ? 'Розслідується' : 'Investigating'}</option>
        <option value="awaiting_information">{uk ? 'Очікує інформації' : 'Awaiting information'}</option>
        <option value="escalated">{uk ? 'Передано на поглиблену перевірку' : 'Escalated'}</option>
        {item.stage !== 'untriaged' && <option value="closed_administratively">
          {uk ? 'Адміністративно закрито (hold залишається)' :
            'Closed administratively (hold remains)'}</option>}
      </select>
    </label>
    <label>{uk ? 'ID відповідального адміністратора мережі' : 'Assigned network administrator ID'}
      <input type="number" min="1" step="1" value={assignedAdminId}
        onChange={event => setAssignedAdminId(event.target.value)}/>
    </label>
    <label>{uk ? 'Пояснення етапу (без персональних даних)' : 'Case note (no personal data)'}
      <textarea maxLength={1000} rows={2} value={note}
        onChange={event => setNote(event.target.value)}/>
    </label>
    <button type="button" disabled={busy} onClick={submit}>
      {busy ? (uk ? 'Збереження…' : 'Saving…') : (uk ? 'Записати етап' : 'Record case stage')}
    </button>
    {error && <p role="alert" className="management-error">{error}</p>}
  </div>
}
