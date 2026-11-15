'use client'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import type { Locale } from '@/i18n/config'

export function PasswordRecovery({ locale, token }: { locale: Locale; token?: string }) {
  const uk = locale === 'uk'
  const isReset = token !== undefined
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (isReset && (!token || password.length < 12 || password !== confirmation)) {
      setError(uk ? 'Перевірте посилання і повторіть пароль (від 12 символів).' : 'Check the link and confirm a password of at least 12 characters.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch(isReset ? '/api/users/reset-password' : '/api/users/forgot-password', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isReset ? { token, password } : { email: email.trim().toLowerCase() }),
      })
      if (response.status === 429) {
        setError(uk ? 'Забагато запитів. Спробуйте пізніше.' : 'Too many requests. Try later.')
      } else if (response.status >= 500) {
        setError(uk ? 'Сервіс тимчасово недоступний.' : 'Service temporarily unavailable.')
      } else if (isReset && !response.ok) {
        setError(uk ? 'Посилання недійсне або термін його дії минув.' : 'This link is invalid or expired.')
      } else if (!isReset && !response.ok) {
        // Do not disclose whether a recovery address is registered.
        setDone(true)
      } else {
        setDone(true)
        setPassword('')
        setConfirmation('')
      }
    } catch {
      setError(uk ? 'Помилка мережі. Спробуйте пізніше.' : 'Network error. Please try later.')
    } finally { setBusy(false) }
  }
  return <section className="customer-auth" aria-labelledby="recovery-title"><div className="customer-auth__panel">
    <p className="customer-auth__eyebrow">GENTLEMEN’S BARBERSHOP</p>
    <h1 id="recovery-title">{isReset ? (uk ? 'Новий пароль' : 'New password') : (uk ? 'Відновлення пароля' : 'Password recovery')}</h1>
    {done ? <p role="status" className="customer-auth__success">{isReset ? (uk ? 'Пароль змінено. Можна увійти.' : 'Password changed. You can sign in.') : (uk ? 'Якщо акаунт існує й email налаштовано, інструкція надійде на пошту.' : 'If the account exists and email is configured, instructions will arrive in your inbox.')}</p> : <form className="customer-auth__form" onSubmit={event => void submit(event)}>
      {isReset ? <>
        <label>{uk ? 'Новий пароль' : 'New password'}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>{uk ? 'Повторіть пароль' : 'Confirm password'}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      </> : <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {error && <p role="alert" className="customer-auth__error">{error}</p>}
      <button className="customer-auth__submit" type="submit" disabled={busy || (isReset && !token)}>{busy ? (uk ? 'Обробка…' : 'Processing…') : isReset ? (uk ? 'Змінити пароль' : 'Change password') : (uk ? 'Надіслати інструкцію' : 'Send instructions')}</button>
    </form>}
    <Link className="customer-auth__back" href={`/${locale}/auth`}>{uk ? '← Повернутися до входу' : '← Back to sign in'}</Link>
  </div></section>
}
