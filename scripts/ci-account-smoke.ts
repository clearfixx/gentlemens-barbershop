import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/**
 * Disposable CI-only integration rehearsal. Requires an already-running
 * production build and isolated PostgreSQL service; never run against a
 * real customer database. No email is sent and no real identities are used.
 */
const base = process.env.CI_ACCOUNT_BASE_URL ?? 'http://localhost:3000'
if (process.env.CI !== 'true' && process.env.CI !== '1') {
  throw new Error('Customer integration smoke requires CI=1')
}
if (!/^http:\/\/localhost:\d+$/.test(base) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) {
  throw new Error('Customer integration smoke only supports local servers')
}
const nonce = randomUUID().replaceAll('-', '')
const password = 'ci-test-only-Passphrase-2026!'
type Json = Record<string, unknown>

async function request(path: string, init: RequestInit = {}): Promise<{ status: number; json: Json }> {
  const response = await fetch(base + path, { redirect: 'manual', cache: 'no-store', ...init })
  const body = await response.text()
  let json: Json = {}
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Json
    } catch { /* HTML from a redirect or error is not echoed to CI logs */ }
  }
  return { status: response.status, json }
}
const headers = { 'content-type': 'application/json' }
const post = (path: string, body: Json, bearer?: string) => request(path, {
  method: 'POST', headers: bearer ? { ...headers, authorization: 'JWT ' + bearer } : headers,
  body: JSON.stringify(body),
})
const patch = (path: string, body: Json, bearer?: string) => request(path, {
  method: 'PATCH', headers: bearer ? { ...headers, authorization: 'JWT ' + bearer } : headers,
  body: JSON.stringify(body),
})

async function createCustomer(label: string) {
  const email = 'account-smoke-' + label + '-' + nonce + '@example.invalid'
  const created = await post('/api/users', { email, password, displayName: 'Smoke ' + label, role: 'admin' })
  assert.equal(created.status, 201, 'Customer registration must succeed in isolated CI')
  const login = await post('/api/users/login', { email, password })
  assert.equal(login.status, 200, 'New customer must log in')
  const token = login.json.token
  const user = login.json.user as Json | undefined
  assert.equal(typeof token, 'string')
  assert.equal(user?.role, 'customer', 'Public registration must not elevate privileges')
  assert.equal(typeof user?.id, 'number')
  return { id: user.id as number, token: token as string }
}

const anonymousCabinet = await request('/uk/account')
assert.ok([302, 303, 307, 308].includes(anonymousCabinet.status), 'Anonymous account page must redirect')
const anonymousHistory = await request('/api/bookings/mine')
assert.equal(anonymousHistory.status, 401, 'Anonymous booking history must be denied')

const first = await createCustomer('first')
const second = await createCustomer('second')
const own = await request('/api/users/' + first.id, { headers: { authorization: 'JWT ' + first.token } })
assert.equal(own.status, 200, 'Customers should read their own records')
const foreign = await request('/api/users/' + second.id, { headers: { authorization: 'JWT ' + first.token } })
assert.ok([403, 404].includes(foreign.status), 'Customers must not read another customer')
const newPhone = '+380 67 123 45 67'
const modified = await patch('/api/users/' + first.id, { displayName: 'Updated smoke customer', phone: newPhone, role: 'admin' }, first.token)
assert.equal(modified.status, 200, 'Customer should update own profile')
const after = await request('/api/users/' + first.id, { headers: { authorization: 'JWT ' + first.token } })
assert.equal(after.status, 200)
const profile = after.json as Json
const stored = profile.doc && typeof profile.doc === 'object' ? profile.doc as Json : profile
assert.equal(stored.displayName, 'Updated smoke customer')
assert.equal(stored.phone, newPhone)
assert.equal(stored.role, 'customer', 'Self-update must not elevate role')
const rejected = await patch('/api/users/' + first.id,
  { displayName: 'Attempted invalid edit', phone: 'invalid-phone' }, first.token)
assert.ok([400, 422].includes(rejected.status), 'Server must reject invalid phone')
const stillOwn = await request('/api/users/' + first.id, {
  headers: { authorization: 'JWT ' + first.token },
})
const afterRejected = stillOwn.json.doc && typeof stillOwn.json.doc === 'object'
  ? stillOwn.json.doc as Json : stillOwn.json
assert.equal(afterRejected.displayName, 'Updated smoke customer',
  'Invalid partial update must not mutate profile name')
assert.equal(afterRejected.phone, newPhone,
  'Invalid partial update must not mutate phone')
const foreignUpdate = await patch('/api/users/' + second.id, { displayName: 'Unauthorized change' }, first.token)
assert.ok([403, 404].includes(foreignUpdate.status), 'Customers must not update another customer')
const history = await request('/api/bookings/mine?filter=upcoming', { headers: { authorization: 'JWT ' + first.token } })
assert.equal(history.status, 200)
assert.ok(Array.isArray(history.json.bookings))
const secondHistory = await request('/api/bookings/mine?filter=upcoming', { headers: { authorization: 'JWT ' + second.token } })
assert.equal(secondHistory.status, 200)
assert.ok(Array.isArray(secondHistory.json.bookings))
console.log('Customer account HTTP smoke passed: registration, login, self-edit, access boundaries and owner-scoped history')
