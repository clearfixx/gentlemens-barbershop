'use client'

import Image from 'next/image'
import { Camera, CircleUserRound, Trash2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/i18n/config'
import { AVATAR_MAX_BYTES } from '@/lib/account/avatar-image'

export function AccountAvatar({ initialUrl, locale, compact = false }: { initialUrl: string | null; locale: Locale; compact?: boolean }) {
  const uk = locale === 'uk'
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > AVATAR_MAX_BYTES || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
      setError(uk ? 'JPG, PNG або WebP до 2 МБ.' : 'JPG, PNG or WebP up to 2 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.set('avatar', file)
      const res = await fetch('/api/account/avatar', { method: 'POST', body: form, credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) { router.replace(`/${locale}/auth`); return }
      if (!res.ok) throw new Error('Upload failed')
      const body: { avatarUrl?: string | null } = await res.json()
      if (!body.avatarUrl) throw new Error('Missing avatar URL')
      setUrl(body.avatarUrl)
      window.dispatchEvent(new CustomEvent('account-avatar-updated', { detail: { url: body.avatarUrl } }))
      router.refresh()
    } catch {
      setError(uk ? 'Не вдалося завантажити фото.' : 'Could not upload photo.')
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE', credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) { router.replace(`/${locale}/auth`); return }
      if (!res.ok) throw new Error('Delete failed')
      setUrl(null)
      window.dispatchEvent(new CustomEvent('account-avatar-updated', { detail: { url: null } }))
      router.refresh()
    } catch { setError(uk ? 'Не вдалося прибрати фото.' : 'Could not remove photo.') }
    finally { setBusy(false) }
  }

  return <div className={"account-avatar-editor" + (compact ? " account-avatar-editor--compact" : "")}>
    <div className="account-identity__avatar">
      {url ? <Image src={url} alt={uk ? 'Ваш аватар' : 'Your avatar'}
        width={104} height={104} unoptimized className="account-avatar-editor__photo" />
        : <CircleUserRound size={44} strokeWidth={1.1} aria-hidden="true" />}
      <button type="button" className="account-avatar-editor__camera" disabled={busy}
        onClick={() => picker.current?.click()}
        aria-label={uk ? 'Змінити аватар' : 'Change avatar'} title={uk ? 'Змінити фото' : 'Change photo'}>
        <Camera size={17} aria-hidden="true" />
      </button>
    </div>
    <input ref={picker} type="file" className="account-avatar-editor__input"
      accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event)}
      aria-label={uk ? 'Виберіть фото профілю' : 'Choose profile picture'} />
    {(!compact || busy) && <p className="account-avatar-editor__hint">{busy ? (uk ? 'Збереження…' : 'Saving…')
      : (uk ? 'JPG, PNG, WebP · до 2 МБ' : 'JPG, PNG, WebP · up to 2 MB')}</p>}
    {url && !compact && <button type="button" className="account-avatar-editor__remove" disabled={busy}
      onClick={() => void remove()}><Trash2 size={13} />{uk ? 'Прибрати' : 'Remove'}</button>}
    {error && <p className="account-avatar-editor__error" role="alert">{error}</p>}
  </div>
}
