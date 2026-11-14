import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverResetMail, resetMailDeliveryConfigured } from './account-email.ts'

const message = {
  to: 'customer@example.invalid',
  subject: 'Reset your password',
  html: '<a href="https://example.com/uk/auth/reset-password?token=safe">Reset</a>',
}
const key = 'ci-only-fake-resend-api-key'
const from = 'noreply@example.com'

test('configured production delivery needs HTTPS and sender credentials', () => {
  assert.equal(resetMailDeliveryConfigured({
    RESEND_API_KEY: key, RESEND_FROM_EMAIL: from,
    NEXT_PUBLIC_SITE_URL: 'https://example.com', NODE_ENV: 'production',
  } as NodeJS.ProcessEnv), true)
  assert.equal(resetMailDeliveryConfigured({
    RESEND_API_KEY: key, RESEND_FROM_EMAIL: from,
    NEXT_PUBLIC_SITE_URL: 'http://example.com', NODE_ENV: 'production',
  } as NodeJS.ProcessEnv), false)
  assert.equal(resetMailDeliveryConfigured({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), false)
})

test('delivery uses Resend endpoint and does not expose secret in result', async () => {
  let calls = 0
  const result = await deliverResetMail({ message, apiKey: key, from,
    send: async (url, init) => {
      calls++
      assert.equal(url, 'https://api.resend.com/emails')
      const body = JSON.parse(String(init?.body))
      assert.deepEqual(body.to, ['customer@example.invalid'])
      assert.equal(body.html, message.html)
      assert.equal(init?.headers && (init.headers as Record<string,string>).Authorization, 'Bearer ' + key)
      return new Response(JSON.stringify({ id: 'ci-mocked-message' }), { status: 200 })
    },
  })
  assert.equal(result.id, 'ci-mocked-message')
  assert.equal(calls, 1)
})

test('missing credentials and provider errors fail closed', async () => {
  await assert.rejects(deliverResetMail({ message }), /unavailable/)
  await assert.rejects(deliverResetMail({
    message, apiKey: key, from, send: async () =>
      new Response(JSON.stringify({ message: 'secret provider details' }), { status: 403 }),
  }), error => {
    assert.equal((error as Error).message, 'Password recovery delivery unavailable')
    return true
  })
})
