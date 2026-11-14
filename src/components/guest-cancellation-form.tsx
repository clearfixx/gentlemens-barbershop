'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { type Locale } from '@/i18n/config'
import { getFallbackMessages } from '@/i18n/messages'
import {
  cleanGuestCancellationCode,
  guestCancellationCountdown,
  isGuestCancellationResult,
  maskGuestCancellationEmail,
  parseGuestBookingId,
  validGuestCancellationEmail,
} from '@/lib/booking/guest-cancellation-ui'

type Stage = 'request' | 'verify' | 'success'
const CODE_LENGTH = 8
const RESEND_COOLDOWN_MS = 5 * 60_000

export function GuestCancellationForm({
  locale, messages, enabled = false, initialBookingId = '',
}: {
  locale: Locale
  messages?: ReturnType<typeof getFallbackMessages>
  enabled?: boolean
  initialBookingId?: string
}) {
  const t = (messages ?? getFallbackMessages(locale)).guestCancellation
  const [stage, setStage] = useState<Stage>('request')
  const [reference, setReference] = useState(initialBookingId)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [clock, setClock] = useState(0)
  const [cancelledId, setCancelledId] = useState<number | null>(null)

  useEffect(() => {
    if (stage !== 'verify' || !cooldownUntil) return
    const interval = setInterval(() => setClock(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [stage, cooldownUntil])

  const bookingId = parseGuestBookingId(reference)
  const resendRemaining = Math.max(0, Math.ceil((cooldownUntil - clock) / 1_000))
  const canRequest = enabled && !busy && bookingId !== null &&
    validGuestCancellationEmail(email)
  const canConfirm = enabled && !busy && stage === 'verify' &&
    bookingId !== null && code.length === CODE_LENGTH

  const requestCode = async () => {
    if (stage === 'verify' && resendRemaining > 0) return
    if (!enabled || busy) return
    if (bookingId === null) { setError(t.invalidId); return }
    if (!validGuestCancellationEmail(email)) { setError(t.invalidEmail); return }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/bookings/guest-cancellation/request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, email: email.trim().toLowerCase() }),
      })
      if (response.status !== 202) {
        setError(response.status === 429 ? t.limited :
          response.status === 503 ? t.unavailable :
            response.status === 400 ? t.invalidEmail : t.requestFailed)
        return
      }
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
          (result as Record<string, unknown>).accepted !== true) {
        throw new Error('Invalid verification response')
      }
      // A 202 intentionally does NOT prove that the booking or email exists.
      setCode('')
      setStage('verify')
      const now = Date.now()
      setClock(now)
      setCooldownUntil(now + RESEND_COOLDOWN_MS)
    } catch {
      setError(t.requestFailed)
    } finally {
      setBusy(false)
    }
  }

  const confirmCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canConfirm || bookingId === null) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/bookings/guest-cancellation/confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, code }),
      })
      if (!response.ok) {
        setError(response.status === 409 ? t.invalidProof :
          response.status === 429 ? t.limited :
            response.status === 503 ? t.unavailable :
              response.status === 400 ? t.invalidCode : t.confirmFailed)
        return
      }
      const result: unknown = await response.json()
      if (!isGuestCancellationResult(result, bookingId)) throw new Error('Invalid result')
      setCancelledId(result.id)
      setCode('')
      setStage('success')
    } catch {
      setError(t.confirmFailed)
    } finally {
      setBusy(false)
    }
  }

  const changeDetails = () => {
    if (busy) return
    setCode('')
    setError('')
    setStage('request')
    setCooldownUntil(0)
    setClock(0)
  }

  if (stage === 'success') {
    return <section className="guest-cancel-success" role="status" aria-live="polite">
      <span className="guest-cancel-success__icon" aria-hidden="true">✓</span>
      <div>
        <p className="eyebrow">{t.cancelledStatus}</p>
        <h2>{t.success}</h2>
        <p>{t.successText}</p>
        <dl className="guest-cancel-success__receipt">
          <div><dt>{t.bookingNumber}</dt><dd>{cancelledId}</dd></div>
          <div><dt>{t.cancelledStatus}</dt><dd>{t.cancelledStatus}</dd></div>
        </dl>
        <Link className="guest-cancel-back" href={`/${locale}/booking`}>{t.backToBooking}</Link>
      </div>
    </section>
  }

  return <section className="guest-cancel" aria-label={t.title}>
    <div className="guest-cancel-grid">
      <form className={`guest-cancel-card ${stage === 'verify' ? 'guest-cancel-card--complete' : ''}`}
        onSubmit={event => { event.preventDefault(); void requestCode() }}>
        <p className="guest-cancel-step">{t.firstStep}</p>
        <h2>{t.requestTitle}</h2>
        <div className="guest-cancel-fields">
          <label htmlFor="guest-cancel-booking">{t.bookingId}</label>
          <input id="guest-cancel-booking" type="text" inputMode="numeric" pattern="[0-9]*"
            autoComplete="off" required maxLength={15} value={reference}
            disabled={stage !== 'request' || busy}
            onChange={event => { setReference(event.target.value); setError('') }}
            placeholder="12345" aria-describedby="guest-cancel-number-help" />
          <p id="guest-cancel-number-help" className="guest-cancel-hint">{t.bookingHint}</p>
          <label htmlFor="guest-cancel-email">{t.email}</label>
          <input id="guest-cancel-email" type="email" autoComplete="email" required maxLength={254}
            value={email} disabled={stage !== 'request' || busy}
            onChange={event => { setEmail(event.target.value); setError('') }}
            placeholder="guest@example.com" />
        </div>
        {stage === 'request'
          ? <button className="guest-cancel-primary" type="submit" disabled={!canRequest}>
              {busy ? t.sending : t.send}
            </button>
          : <button className="guest-cancel-secondary" type="button" onClick={changeDetails}
              disabled={busy}>{t.changeEmail}</button>}
        <p className="guest-cancel-help">{t.resent}</p>
        <div className="guest-cancel-facts">
          <span>{t.validFor}</span><span>{t.attempts}</span><span>{t.repeatAfter}</span>
        </div>
      </form>

      <form className={`guest-cancel-card ${stage === 'request' ? 'guest-cancel-card--inactive' : ''}`}
        onSubmit={confirmCode} aria-disabled={stage !== 'verify'}>
        <p className="guest-cancel-step">{t.secondStep}</p>
        <h2>{t.verifyTitle}</h2>
        <label className="guest-cancel-code-label" htmlFor="guest-cancel-code">{t.code}</label>
        <div className="guest-cancel-code" aria-hidden="false">
          <div className="guest-cancel-code__cells" aria-hidden="true">
            {Array.from({ length: CODE_LENGTH }, (_, index) =>
              <span key={index}>{code[index] ?? ''}</span>)}
          </div>
          <input id="guest-cancel-code" type="text" inputMode="numeric"
            autoComplete="one-time-code" pattern="[0-9]{8}"
            maxLength={CODE_LENGTH} value={code} required
            disabled={stage !== 'verify' || busy}
            onChange={event => {
              setCode(cleanGuestCancellationCode(event.target.value))
              setError('')
            }} />
        </div>
        {stage === 'verify' && <p className="guest-cancel-code-hint">
          {t.resent} <strong>{maskGuestCancellationEmail(email)}</strong>
        </p>}
        <p className="guest-cancel-hint">{t.codeHint}</p>
        <button className="guest-cancel-primary" type="submit" disabled={!canConfirm}>
          {busy ? t.confirming : t.confirm}
        </button>
        {stage === 'verify' && <div className="guest-cancel-resend">
          {resendRemaining > 0
            ? <span>{t.retryIn} {guestCancellationCountdown(resendRemaining)}</span>
            : <button type="button" disabled={busy} onClick={() => void requestCode()}>
                {t.resend}
              </button>}
        </div>}
      </form>
    </div>

    {error && <p className="guest-cancel-error" role="alert">{error}</p>}
    {!enabled && <p className="guest-cancel-warning" role="status">{t.featureOff}</p>}

    <aside className="guest-cancel-info" aria-label={t.important}>
      <h2>{t.important}</h2>
      <ul><li>{t.note1}</li><li>{t.note2}</li><li>{t.note3}</li></ul>
    </aside>
  </section>
}
