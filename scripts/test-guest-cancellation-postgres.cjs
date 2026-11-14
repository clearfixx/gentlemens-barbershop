/* eslint-disable @typescript-eslint/no-require-imports -- CI-only CommonJS fixture. */
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')

// Resolve the Drizzle/Postgres packages from the installed Payload adapter.
// This test does not change app dependencies or initialize Payload schema push.
const fromAdapter = createRequire(require.resolve('@payloadcms/db-postgres'))
const { Pool } = fromAdapter('pg')
const { drizzle } = fromAdapter('drizzle-orm/node-postgres')

async function main() {
  assert.equal(process.env.CI, 'true')
  assert.equal(process.env.NODE_ENV, 'development')
  assert.equal(process.env.BOOKING_WRITE_TEST_MODE, 'enabled')
  assert.equal(process.env.DATABASE_URL,
    'postgresql://postgres:postgres@localhost:5432/gentlemens_barbershop')
  const secret = process.env.PAYLOAD_SECRET
  assert.ok(secret && secret.length >= 32)
  const guestId = Number(process.env.CI_GUEST_BOOKING_ID)
  const accountId = Number(process.env.CI_ACCOUNT_BOOKING_ID)
  assert.ok([guestId, accountId].every(id => Number.isSafeInteger(id) && id > 0))
  const { sql } = await import('@payloadcms/db-postgres')
  const { requestGuestCancellation, confirmGuestCancellation, GuestCancellationConflictError } =
    await import('../src/lib/booking/guest-cancellation.ts')
  const { up } = await import('../src/migrations/20261113_150000_booking_guest_cancellation_challenge.ts')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const payload = { db: { drizzle: drizzle(pool) } }
    await up({ db: payload.db.drizzle })
    const code = '04821635'
    let delivered = 0
    const issue = (bookingId, email, otp = code) => requestGuestCancellation({
      payload, bookingId, email, secret, code: otp,
      deliver: async (to, actual) => {
        assert.equal(to, 'staging-guest@example.invalid')
        assert.equal(actual, code)
        delivered++
      },
    })
    await issue(guestId, 'wrong@example.invalid')
    await issue(accountId, 'customer-ci@example.invalid')
    assert.equal(delivered, 0)
    await issue(guestId, 'staging-guest@example.invalid')
    assert.equal(delivered, 1)
    await issue(guestId, 'staging-guest@example.invalid', '12345678')
    assert.equal(delivered, 1)
    await assert.rejects(confirmGuestCancellation({
      payload, bookingId: guestId, code: '12345678', secret,
    }), GuestCancellationConflictError)
    const failed = await payload.db.drizzle.execute(sql`
      SELECT attempts FROM booking_guest_cancellation_challenges WHERE booking_id = ${guestId}
    `)
    assert.equal(Number(failed.rows[0]?.attempts), 1)
    assert.deepEqual(await confirmGuestCancellation({ payload, bookingId: guestId, code, secret }), {
      id: guestId, status: 'cancelled',
    })
    const result = await payload.db.drizzle.execute(sql`
      SELECT b.customer_id, b.status, c.consumed_at, e.actor_id, e.actor_role, e.action
      FROM bookings b JOIN booking_guest_cancellation_challenges c ON c.booking_id = b.id
      JOIN booking_events e ON e.booking_id = b.id AND e.actor_role = 'guest'
      WHERE b.id = ${guestId}
    `)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0]?.customer_id, null)
    assert.equal(result.rows[0]?.status, 'cancelled')
    assert.ok(result.rows[0]?.consumed_at)
    assert.equal(result.rows[0]?.actor_id, null)
    assert.equal(result.rows[0]?.actor_role, 'guest')
    assert.equal(result.rows[0]?.action, 'cancelled')
    await assert.rejects(confirmGuestCancellation({
      payload, bookingId: guestId, code, secret,
    }), GuestCancellationConflictError)
    const owner = await payload.db.drizzle.execute(sql`
      SELECT status FROM bookings WHERE id = ${accountId}
    `)
    assert.equal(owner.rows[0]?.status, 'pending')
    console.log('GUEST CANCELLATION POSTGRES OK: verified email, expiry-scoped challenge, ' +
      'failed attempt, guest audit, one-time cancellation, signed-in booking isolation')
  } finally {
    await pool.end()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
