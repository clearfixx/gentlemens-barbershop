import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const expected = 'postgresql://barbershop_test:local-integration-only@127.0.0.1:55432/barbershop_integration'
if (process.env.DATABASE_URL !== expected || process.env.NODE_ENV === 'production' ||
    process.env.BOOKING_WRITE_TEST_MODE !== 'enabled') {
  throw new Error('HTTP integration requires the isolated database and explicit write-test mode')
}
const origin = process.env.BOOKING_HTTP_ORIGIN ?? 'http://127.0.0.1:3100'
const url = new URL(origin)
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
  throw new Error('Refusing to test a non-loopback HTTP server')
}
const payload = await getPayload({ config })
const db = payload.db.drizzle
const tag = randomUUID().replaceAll('-', '').slice(0, 16)
const userIds: number[] = []
const barberIds: number[] = []
const bookingIds: number[] = []

async function createUser(role: 'admin' | 'barber' | 'customer') {
  const password = 'TestOnly-' + randomUUID() + '-A1!'
  const email = `http-${role}-${randomUUID()}@example.invalid`
  const user = await payload.create({
    collection: 'users', overrideAccess: true,
    data: { email, password, role },
  })
  userIds.push(Number(user.id))
  return { id: Number(user.id), email, password }
}
async function createBarber(userId: number) {
  const result = await db.execute(sql`
    INSERT INTO barbers (name, slug, location_id, user_id)
    VALUES (${'HTTP ' + tag}, ${'http-' + randomUUID()}, 1, ${userId}) RETURNING id
  `)
  const id = Number(result.rows[0]?.id)
  assert.ok(id > 0)
  barberIds.push(id)
  return id
}
async function createBooking(barberId: number, customerId: number) {
  const result = await db.execute(sql`
    INSERT INTO bookings (location_id, barber_id, customer_id, customer_name, customer_phone,
      starts_at, ends_at, total_price, status)
    VALUES (1, ${barberId}, ${customerId}, 'HTTP fixture', '+380000000000',
      '2041-01-03T09:00:00Z', '2041-01-03T10:00:00Z', 100, 'pending') RETURNING id
  `)
  const id = Number(result.rows[0]?.id)
  assert.ok(id > 0)
  bookingIds.push(id)
  return id
}
async function login(email: string, password: string) {
  const response = await fetch(new URL('/api/users/login', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(response.status, 200, 'Payload login failed')
  const cookie = response.headers.get('set-cookie')
  assert.ok(cookie, 'Payload login returned no session cookie')
  return cookie.split(';', 1)[0]
}
async function patch(id: number | string, cookie: string | undefined, body: string,
  contentType = 'application/json') {
  return fetch(new URL('/api/bookings/' + id + '/status', origin), {
    method: 'PATCH',
    headers: { 'content-type': contentType, ...(cookie ? { cookie } : {}) },
    body,
  })
}
async function audit(id: number) {
  const result = await db.execute(sql`SELECT action FROM booking_events WHERE booking_id = ${id} ORDER BY id`)
  return result.rows.map(row => row.action)
}
async function state(id: number) {
  const result = await db.execute(sql`SELECT status FROM bookings WHERE id = ${id}`)
  return result.rows[0]?.status
}
async function run() {
  try {
    const health = await fetch(new URL('/api/bookings/history', origin))
    assert.equal(health.status, 401, 'Server must be reachable and anonymous history denied')
    const admin = await createUser('admin')
    const assigned = await createUser('barber')
    const other = await createUser('barber')
    const customer = await createUser('customer')
    const assignedBarberId = await createBarber(assigned.id)
    await createBarber(other.id)
    const bookingId = await createBooking(assignedBarberId, customer.id)
    const [adminCookie, barberCookie, otherCookie, customerCookie] = await Promise.all([
      login(admin.email, admin.password), login(assigned.email, assigned.password),
      login(other.email, other.password), login(customer.email, customer.password),
    ])

    async function rejected(cookie: string | undefined, body: string, expectedStatus: number,
      id: number | string = bookingId, contentType?: string) {
      const before = await state(bookingId)
      const eventsBefore = await audit(bookingId)
      const response = await patch(id, cookie, body, contentType)
      assert.equal(response.status, expectedStatus, `Expected ${expectedStatus}, got ${response.status}: ${await response.text()}`)
      assert.equal(await state(bookingId), before)
      assert.deepEqual(await audit(bookingId), eventsBefore)
    }

    await rejected(undefined, '{"status":"confirmed"}', 401)
    await rejected(otherCookie, '{"status":"confirmed"}', 404)
    await rejected(customerCookie, '{"status":"confirmed"}', 403)
    await rejected(adminCookie, '{"status":"confirmed"}', 400, 'invalid')
    await rejected(adminCookie, '{"status":"unknown"}', 400)
    await rejected(adminCookie, '{"status":"confirmed","extra":1}', 400)
    await rejected(adminCookie, '{bad-json', 400)
    await rejected(adminCookie, '{"status":"confirmed"}', 415, bookingId, 'text/plain')
    await rejected(adminCookie, '{"status":"confirmed","reason":' + JSON.stringify('x'.repeat(2100)) + '}', 413)

    const barberHistory = await fetch(new URL('/api/bookings/history?limit=50', origin), {
      headers: { cookie: barberCookie },
    })
    assert.equal(barberHistory.status, 200)
    const list = await barberHistory.json() as { docs: Array<{ id: number }> }
    assert.ok(list.docs.some(item => item.id === bookingId))
    const otherHistory = await fetch(new URL('/api/bookings/history', origin), {
      headers: { cookie: otherCookie },
    })
    assert.equal(otherHistory.status, 200)
    const otherList = await otherHistory.json() as { docs: Array<{ id: number }> }
    assert.ok(!otherList.docs.some(item => item.id === bookingId))

    const confirmed = await patch(bookingId, barberCookie, '{"status":"confirmed"}')
    assert.equal(confirmed.status, 200, await confirmed.text())
    assert.equal(await state(bookingId), 'confirmed')
    assert.deepEqual(await audit(bookingId), ['confirmed'])
    await rejected(barberCookie, '{"status":"confirmed"}', 409)
    const cancelled = await patch(bookingId, adminCookie, '{"status":"cancelled"}')
    assert.equal(cancelled.status, 200, await cancelled.text())
    assert.equal(await state(bookingId), 'cancelled')
    assert.deepEqual(await audit(bookingId), ['confirmed', 'cancelled'])
    console.info('PASS: authenticated HTTP status changes, role scopes, validation and audit isolation')
    // Force the shared budget to its limit and verify that neither HTTP write
    // route can mutate a booking. Use the database clock to match SQL windows.
    // Retry if the wall clock crosses a minute while the fixture is prepared.
    let throttlingVerified = false
    for (let attempt = 0; attempt < 3 && !throttlingVerified; attempt++) {
      const now = Date.now()
      const windowStart = Math.floor(now / 60_000) * 60_000
      if (now - windowStart > 55_000) {
        await new Promise(resolve => setTimeout(resolve, 5_500))
        continue
      }
      await db.execute(sql`
        INSERT INTO booking_rate_limit_buckets(identity, window_start, hits)
        VALUES ('booking:write:global', ${windowStart}, 20)
        ON CONFLICT (identity, window_start) DO UPDATE SET hits = 20
      `)
      const before = await state(bookingId)
      const eventsBefore = await audit(bookingId)
      const deniedPatch = await patch(bookingId, adminCookie, '{"status":"confirmed"}')
      const deniedPost = await fetch(new URL('/api/bookings', origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: customerCookie },
        body: '{}',
      })
      if (Math.floor(Date.now() / 60_000) !== Math.floor(now / 60_000)) {
        // A minute rollover invalidates this fixture; retry next window.
        continue
      }
      assert.equal(deniedPatch.status, 429, await deniedPatch.text())
      assert.equal(deniedPost.status, 429, await deniedPost.text())
      assert.ok(Number(deniedPatch.headers.get('retry-after')) >= 1)
      assert.ok(Number(deniedPost.headers.get('retry-after')) >= 1)
      assert.equal(await state(bookingId), before)
      assert.deepEqual(await audit(bookingId), eventsBefore)
      throttlingVerified = true
    }
    assert.ok(throttlingVerified, 'Unable to test shared HTTP budget without a minute rollover')
    await db.execute(sql`
      DELETE FROM booking_rate_limit_buckets WHERE identity = 'booking:write:global'
    `)
    console.info('PASS: shared HTTP limiter rejects POST and PATCH without booking mutation')

  } finally {
    for (const id of bookingIds) {
      await db.execute(sql`DELETE FROM booking_events WHERE booking_id = ${id}`)
      await db.execute(sql`DELETE FROM bookings WHERE id = ${id}`)
    }
    for (const id of barberIds) await db.execute(sql`DELETE FROM barbers WHERE id = ${id}`)
    for (const id of userIds) {
      await payload.delete({ collection: 'users', id, overrideAccess: true })
    }
    console.info('HTTP fixture cleanup completed')
  }
}
run().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
