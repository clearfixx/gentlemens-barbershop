/**
 * A phone is optional. Allow an international number, a plain national number
 * or a national area code in parentheses (e.g. (044) 555-12-34).
 * Preserve customer formatting rather than silently rewriting their contact.
 */
export function validateProfilePhone(value: unknown): true | string {
  if (value === '' || value === undefined || value === null) return true
  if (typeof value !== 'string' || value.length > 32 || value !== value.trim()) {
    return 'Invalid phone number'
  }
  const digits = value.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return 'Invalid phone number'
  if (!/^\+?[0-9 ()-]+$/.test(value)) return 'Invalid phone number'
  if (!/^(?:\+?[0-9]|\([0-9]{2,5}\))/.test(value)) return 'Invalid phone number'
  const parentheses = value.match(/[()]/g)?.join('') ?? ''
  if (parentheses !== '' && parentheses !== '()') return 'Invalid phone number'
  if (parentheses === '()' && !/\([0-9]{2,5}\)/.test(value)) return 'Invalid phone number'
  if (!/[0-9]$/.test(value)) return 'Invalid phone number'
  return true
}
