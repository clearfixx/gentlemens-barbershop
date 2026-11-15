'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Locale } from '@/i18n/config'

/** Uses the existing owner-scoped, atomic cancellation endpoint. */
export function AccountBookingCancel({ id, locale }: { id: number; locale: Locale }) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function cancel() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) {
        setError(response.status === 409
          ? (uk ? 'Цей запис уже не можна скасувати.' : 'This booking can no longer be cancelled.')
          : (uk ? 'Скасування недоступне. Спробуйте пізніше.' : 'Cancellation unavailable. Please retry later.'))
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError(uk ? 'Помилка мережі. Спробуйте ще раз.' : 'Network error. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-cancel">
    {confirming ? (
      <div className="account-cancel__confirm">
        <span>{uk ? 'Скасувати запис?' : 'Cancel booking?'}</span>
        <button type="button" disabled={busy} onClick={() => void cancel()}>{uk ? 'Так, скасувати' : 'Yes, cancel'}</button>
        <button type="button" disabled={busy} onClick={() => { setConfirming(false); setError('') }}>{uk ? 'Ні' : 'No'}</button>
      </div>
    ) : (
      <button type="button" onClick={() => setConfirming(true)}>{uk ? 'Скасувати запис' : 'Cancel booking'}</button>
    )}
    {error && <p className="account-cancel__error" role="alert">{error}</p>}
  </div>
}
