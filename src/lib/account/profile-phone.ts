/**
 * Profile phone is optional, but when present must be a plausible international
 * or Ukrainian number. No formatting is silently removed from the stored value.
 */
export function validateProfilePhone(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string' || value.length > 32 ||
      !/^\+?[0-9 ()-]+$/.test(value) || !/^\+?[0-9]/.test(value) ||
      value.replace(/\D/g, '').length < 7 || value.replace(/\D/g, '').length > 15) {
    return 'Invalid phone number'
  }
  return true
}
