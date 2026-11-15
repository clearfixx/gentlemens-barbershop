import type { EmailAdapter, SendEmailOptions } from 'payload'

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const DEFAULT_SENDER = 'Gentlemen’s Barbershop'

function address(value: SendEmailOptions['to']): string {
  if (typeof value === 'string' && ADDRESS.test(value)) return value
  if (value && !Array.isArray(value) && typeof value === 'object' &&
      'address' in value && typeof value.address === 'string' && ADDRESS.test(value.address)) {
    return value.address
  }
  throw new Error('Password recovery delivery unavailable')
}

export function resetMailDeliveryConfigured(env: NodeJS.ProcessEnv): boolean {
  return !!(env.RESEND_API_KEY && env.RESEND_API_KEY.length >= 16 &&
    env.RESEND_FROM_EMAIL && ADDRESS.test(env.RESEND_FROM_EMAIL) &&
    env.NEXT_PUBLIC_SITE_URL && (!env.NODE_ENV || env.NODE_ENV !== 'production' ||
      (() => {
        try { return new URL(env.NEXT_PUBLIC_SITE_URL).protocol === 'https:' } catch { return false }
      })()))
}

/** Only password reset email is supported; no attachments or bulk recipients. */
export async function deliverResetMail(input: {
  message: SendEmailOptions
  apiKey?: string
  from?: string
  send?: typeof fetch
}): Promise<{ id: string }> {
  if (!input.apiKey || input.apiKey.length < 16 || !input.from || !ADDRESS.test(input.from)) {
    throw new Error('Password recovery delivery unavailable')
  }
  const to = address(input.message.to)
  if (typeof input.message.subject !== 'string' || !input.message.subject.trim() ||
      typeof input.message.html !== 'string' || !input.message.html.includes('reset-password?token=')) {
    throw new Error('Password recovery delivery unavailable')
  }
  const response = await (input.send ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${DEFAULT_SENDER} <${input.from}>`,
      to: [to],
      subject: input.message.subject,
      html: input.message.html,
    }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error('Password recovery delivery unavailable')
  const body: unknown = await response.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('id' in body) ||
      typeof body.id !== 'string' || !body.id) {
    throw new Error('Password recovery delivery unavailable')
  }
  return { id: body.id }
}

/** The adapter fails closed when Resend is not configured, never prints tokens. */
export const accountEmailAdapter: EmailAdapter = () => ({
  name: 'gentlemens-resend-password',
  defaultFromName: DEFAULT_SENDER,
  defaultFromAddress: process.env.RESEND_FROM_EMAIL || 'unconfigured@example.invalid',
  sendEmail: async (message) => deliverResetMail({
    message,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM_EMAIL,
  }),
})
