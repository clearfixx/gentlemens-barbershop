'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { Locale } from '@/i18n/config'

type Mode = 'login' | 'register'

export function CustomerAuthForm({ locale }: { locale: Locale }) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (password.length < 8) {
      setError(uk ? 'Пароль має містити щонайменше 8 символів.' : 'Password must contain at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        const created = await fetch('/api/users', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName: displayName.trim() }),
        })
        if (!created.ok) {
          throw new Error(uk ? 'Не вдалося створити обліковий запис. Перевір дані або спробуй іншу пошту.' : 'Could not create the account. Check your details or use a different email.')
        }
      }

      const response = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        throw new Error(
          mode === 'register'
            ? (uk ? 'Обліковий запис створено, але автоматичний вхід не вдався. Спробуй увійти.' : 'Account created, but automatic login failed. Try signing in.')
            : (uk ? 'Невірна пошта або пароль.' : 'Incorrect email or password.')
        )
      }

      router.replace(`/${locale}/account`)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (uk ? 'Сталася помилка. Спробуй ще раз.' : 'An error occurred. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="customer-auth" aria-labelledby="customer-auth-title">
      <div className="customer-auth__panel">
        <p className="customer-auth__eyebrow">GENTLEMEN’S BARBERSHOP</p>
        <h1 id="customer-auth-title">{mode === 'login' ? (uk ? 'З поверненням.' : 'Welcome back.') : (uk ? 'Створити профіль.' : 'Create an account.')}</h1>
        <p className="customer-auth__intro">
          {mode === 'login'
            ? (uk ? 'Увійди до свого облікового запису.' : 'Sign in to your account.')
            : (uk ? 'Створи обліковий запис для майбутніх візитів.' : 'Create an account for future visits.')}
        </p>
        <div className="customer-auth__tabs" role="group" aria-label={uk ? 'Тип форми' : 'Form type'}>
          <button type="button" className={mode === 'login' ? 'is-active' : ''} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError('') }}>
            {uk ? 'Вхід' : 'Sign in'}
          </button>
          <button type="button" className={mode === 'register' ? 'is-active' : ''} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError('') }}>
            {uk ? 'Реєстрація' : 'Sign up'}
          </button>
        </div>
        <form onSubmit={event => void submit(event)} className="customer-auth__form">
          {mode === 'register' && <label>
            {uk ? 'Ім’я' : 'Name'}
            <input
              type="text"
              autoComplete="name"
              maxLength={100}
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              placeholder={uk ? 'Як до тебе звертатися' : 'Your name'}
            />
          </label>}
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" />
          </label>
          <label>
            {uk ? 'Пароль' : 'Password'}
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={uk ? 'Щонайменше 8 символів' : 'At least 8 characters'}
            />
          </label>
          {error && <p className="customer-auth__error" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="customer-auth__submit">
            {busy ? (uk ? 'Виконується…' : 'Working…') : mode === 'login' ? (uk ? 'Увійти →' : 'Sign in →') : (uk ? 'Зареєструватися →' : 'Create account →')}
          </button>
        </form>
        {mode === 'login' && <Link className="customer-auth__recover" href={`/${locale}/auth/forgot-password`}>{uk ? 'Забули пароль?' : 'Forgot password?'}</Link>}
        <Link className="customer-auth__back" href={`/${locale}`}>{uk ? '← На головну' : '← Back to home'}</Link>
      </div>
    </section>
  )
}
