'use client'

import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Locale } from '@/i18n/config'

export function AccountProfileName({ initialName, email, userId, locale }: {
  initialName: string
  email: string
  userId: number
  locale: Locale
}) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [draft, setDraft] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const next = draft.trim()
    if (next.length < 2 || next.length > 100) {
      setError(uk ? 'Ім’я повинно містити від 2 до 100 символів.' : 'Name must be between 2 and 100 characters.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Payload's user collection enforces authenticated self-only updates.
      // Only the display name is submitted; role and email are never modified here.
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: next }),
      })
      if (!response.ok) throw new Error('Failed to save')
      setName(next)
      setEditing(false)
      router.refresh()
    } catch {
      setError(uk ? 'Не вдалося зберегти зміни. Спробуйте ще раз.' : 'Could not save changes. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="account-profile-fields">
      {editing ? (
        <form className="account-profile-edit" onSubmit={event => void save(event)}>
          <label htmlFor="account-display-name">{uk ? 'Ваше ім’я' : 'Your name'}</label>
          <div className="account-profile-edit__controls">
            <input id="account-display-name" name="displayName" autoComplete="name"
              minLength={2} maxLength={100} required value={draft}
              onChange={event => setDraft(event.target.value)} disabled={saving} />
            <button type="submit" disabled={saving} aria-label={uk ? 'Зберегти ім’я' : 'Save name'}><Check size={20} /></button>
            <button type="button" disabled={saving} aria-label={uk ? 'Скасувати редагування' : 'Cancel editing'} onClick={() => { setEditing(false); setDraft(name); setError('') }}><X size={20} /></button>
          </div>
          {error && <p className="account-profile-error" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="account-profile-name">
          <h2>{name}</h2>
          <button type="button" className="account-profile-pencil"
            onClick={() => { setEditing(true); setDraft(name); setError('') }}
            aria-label={uk ? 'Редагувати ім’я' : 'Edit name'}><Pencil size={17} /></button>
        </div>
      )}
      <p className="account-profile-email">{email}</p>
      <span className="account-subtle">{uk ? 'Email для входу та підтверджень бронювання' : 'Email for signing in and booking confirmations'}</span>
    </div>
  )
}
