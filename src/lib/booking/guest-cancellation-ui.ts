/** Client-only formatting/response boundaries for the guest cancellation form. */
export function parseGuestBookingId(value: string): number | null {
  const trimmed = value.trim()
  if (!/^[0-9]{1,15}$/.test(trimmed)) return null
  const id = Number(trimmed)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function validGuestCancellationEmail(value: string): boolean {
  const email = value.trim()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function cleanGuestCancellationCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function isGuestCancellationResult(
  value: unknown,
  bookingId: number,
): value is { id: number; status: 'cancelled' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return data.id === bookingId && data.status === 'cancelled'
}

export function guestCancellationCountdown(seconds: number): string {
  const remaining = Math.max(0, Math.min(300, Math.floor(seconds)))
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
}

export function maskGuestCancellationEmail(value: string): string {
  const [local, domain] = value.trim().split('@')
  if (!local || !domain) return ''
  return `${local[0]}***@${domain}`
}
