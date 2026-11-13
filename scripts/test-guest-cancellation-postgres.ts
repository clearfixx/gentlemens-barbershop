import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../src/payload.config.ts'
import { confirmGuestCancellation, GuestCancellationConflictError, requestGuestCancellation } from '../src/lib/booking/guest-cancellation.ts'
import { up } from '../src/migrations/20261113_150000_booking_guest_cancellation_challenge.ts'

async function main() {
  assert.equal(process.env.CI, 'true')
  assert.equal(process.env.NODE_ENV, 'development')
  assert.equal(process.env.BOOKING_WRITE_TEST_MODE, 'enabled')
  const secret = process.env.PAYLOAD_SECRET
  assert.ok(secret && secret.length >= 32)
  const guestId = Number(process.env.CI_GUEST_BOOKING_ID)
  const accountId = Number(process.env.CI_ACCOUNT_BOOKING_ID)
  assert.ok([guestId, accountId].every(id => Number.isSafeInteger(id) && id > 0))
  const payload = await getPayload({ config })
  await up({ db: payload.db.drizzle } as Parameters<typeof up>[0])
  const code = '04821635'
  let delivered = 0
  const request = (bookingId: number, email: string, otp = code) => requestGuestCancellation({
    payload, bookingId, email, secret, code: otp,
    deliver: async (to, actual) => {
      assert.equal(to, 'staging-guest@example.invalid')
      assert.equal(actual, code)
      delivered++
    },
  })
  await request(guestId, 'wrong@example.invalid')
  await request(accountId, 'customer-ci@example.invalid')
  assert.equal(delivered, 0)
  await request(guestId, 'staging-guest@example.invalid')
  assert.equal(delivered, 1)
  await request(guestId, 'staging-guest@example.invalid', '12345678')
  assert.equal(delivered, 1, 'Cooldown must retain prior code')
  await assert.rejects(confirmGuestCancellation({
    payload, bookingId: guestId, code: '12345678', secret,
  }), GuestCancellationConflictError)
  const failedAttempt = await payload.db.drizzle.execute(sql`
    SELECT attempts FROM booking_guest_cancellation_challenges WHERE booking_id = ${guestId}
  `)
  assert.equal(Number(failedAttempt.rows[0]?.attempts), 1)
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
  await assert.rejects(confirmGuestCancellation({ payload, bookingId: guestId, code, secret }),
    GuestCancellationConflictError)
  const owner = await payload.db.drizzle.execute(sql`
    SELECT status FROM bookings WHERE id = ${accountId}
  `)
  assert.equal(owner.rows[0]?.status, 'pending')
  console.log('GUEST CANCELLATION POSTGRES OK: owner email, cooldown, one-time code, guest audit')
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
