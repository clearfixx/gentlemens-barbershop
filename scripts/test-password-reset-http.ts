import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

/** Disposable local CI only. Token is never printed or written to disk. */
const base = process.env.CI_ACCOUNT_BASE_URL || 'http://localhost:3000'
if (process.env.CI !== 'true' || process.env.NODE_ENV !== 'production' ||
    !/^http:\/\/localhost:\d+$/.test(base)) {
  throw new Error('Password reset smoke is restricted to isolated production-mode CI')
}
const payload = await getPayload({ config })
const email = 'reset-' + randomUUID().replaceAll('-', '') + '@example.invalid'
const first = 'ci-old-Password-2026!'
const second = 'ci-new-Password-2026!'
const user = await payload.create({
  collection: 'users', data: { email, password: first, displayName: 'Reset CI', role: 'customer' },
})
assert.equal(user.role, 'customer')
async function post(path: string, data: Record<string, unknown>) {
  const response = await fetch(base + path, {
    method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.status
}
assert.equal(await post('/api/users/login', { email, password: first }), 200)
// Payload generates and persists the one-time token; disableEmail avoids
// sending any external email in CI while exercising the real reset REST API.
const token = await payload.forgotPassword({
  collection: 'users', data: { email }, disableEmail: true,
})
assert.equal(typeof token, 'string')
assert.ok(token.length > 12)
assert.equal(await post('/api/users/reset-password', { token, password: second }), 200)
assert.notEqual(await post('/api/users/login', { email, password: first }), 200)
assert.equal(await post('/api/users/login', { email, password: second }), 200)
assert.notEqual(await post('/api/users/reset-password', { token, password: 'reuse-Password-2026!' }), 200)
console.log('RESET CI OK: token created, one-time redemption, old password refused, new password accepted')
