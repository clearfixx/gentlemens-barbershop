'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ProfessionalBiographyApprove({ id, locale, kind = 'bio' }: {
  id: number; locale: string; kind?: 'bio' | 'localizedBio'
}) {
  const router = useRouter()
  const uk = locale === 'uk'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function approve() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/professional-reviews/${id}/${kind === 'localizedBio' ? 'approve-localized' : 'approve'}`, {
        method: 'POST',
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Заявка або публічна біографія змінилася. Оновіть сторінку.' : 'Proposal or published biography changed. Refresh.')
          : response.status === 422
            ? (uk ? 'Ця заявка містить непідтримувані зміни.' : 'This proposal has unsupported changes.')
            : (uk ? 'Не вдалося схвалити біографію.' : 'Could not approve the biography.'))
        return
      }
      router.refresh()
    } catch {
      setError(uk ? 'Помилка з’єднання.' : 'Network error.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="management-biography-approve">
    <button type="button" disabled={busy} onClick={approve}>
      {busy ? (uk ? 'Публікація…' : 'Publishing…') : (kind === 'localizedBio'
        ? (uk ? 'Схвалити переклад' : 'Approve translation')
        : (uk ? 'Схвалити біографію' : 'Approve biography'))}
    </button>
    {error && <p role="alert" className="management-error">{error}</p>}
  </div>
}
