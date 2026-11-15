'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import type { Locale } from '@/i18n/config'

export function AccountSidebarLogout({ locale }: { locale: Locale }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const uk = locale === 'uk'
  async function logout() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const response = await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error('Logout failed')
      router.replace('/' + locale)
      router.refresh()
    } catch {
      setError(true)
      setBusy(false)
    }
  }
  return <>
    <button type="button" className="account-sidebar__item account-sidebar__logout"
      disabled={busy} onClick={() => void logout()}>
      <LogOut size={19}/>{uk ? 'Вийти' : 'Log out'}
    </button>
    {error && <p className="account-sidebar__error" role="alert">
      {uk ? 'Не вдалося вийти. Спробуйте ще раз.' : 'Could not log out. Please try again.'}</p>}
  </>
}
