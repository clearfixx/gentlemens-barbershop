import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { BookingManagementError, changeBookingStatus } from '../src/lib/booking/manage-booking.ts'

const expected = 'postgresql://barbershop_test:local-integration-only@127.0.0.1:55432/barbershop_integration'
if (process.env.DATABASE_URL !== expected) {
  throw new Error('Refusing integration test outside the isolated local PostgreSQL database')
}

const payload = await getPayload({ config })
const db = payload.db.drizzle
const tag = randomUUID().replaceAll('-', '').slice(0, 16)
const users: number[] = []
const barbers: number[] = []
const bookings: number[] = []

async function id(query: ReturnType<typeof sql>) {
  const result = await db.execute(query)
  const value = Number(result.rows[0]?.id)
  assert.ok(Number.isSafeInteger(value) && value > 0)
  return value
}
async function status(bookingId: number) {
  const result = await db.execute(sql`SELECT status FROM bookings WHERE id = ${bookingId}`)
  return result.rows[0]?.status
}
async function events(bookingId: number) {
  const result = await db.execute(sql`
    SELECT action, previous_status, actor_id, actor_role
    FROM booking_events WHERE booking_id = ${bookingId} ORDER BY id
  `)
  return result.rows
}
async function denied(
  bookingId: number, principal: { id: number; role: string }, to: 'confirmed' | 'cancelled' | 'completed' | 'no_show',
  statusCode: number,
) {
  const before = await status(bookingId)
  const auditBefore = await events(bookingId)
  await assert.rejects(
    changeBookingStatus({ payload, principal, bookingId, to }),
    (error: unknown) => error instanceof BookingManagementError && error.statusCode === statusCode,
  )
  assert.equal(await status(bookingId), before, 'denied request changed booking status')
  assert.deepEqual(await events(bookingId), auditBefore, 'denied request changed audit history')
}
async function createdBooking(barberId: number, startsAt: string) {
  const bookingId = await id(sql`
    INSERT INTO bookings
      (location_id, barber_id, customer_name, customer_phone, starts_at, ends_at, total_price, status)
    VALUES (1, ${barberId}, ${'Integration ' + tag}, '+380000000000',
      ${startsAt}::timestamptz, (${startsAt}::timestamptz + interval '1 hour'), 100, 'pending')
    RETURNING id
  `)
  bookings.push(bookingId)
  return bookingId
}
async function run() {
try {
  // Fixtures are distinct from the existing customer, barber and ten bookings.
  const adminId = await id(sql`
    INSERT INTO users (email, role) VALUES (${'integration-admin-' + tag + '@example.invalid'}, 'admin') RETURNING id
  `)
  users.push(adminId)
  const barberId = await id(sql`
    INSERT INTO users (email, role) VALUES (${'integration-barber-' + tag + '@example.invalid'}, 'barber') RETURNING id
  `)
  users.push(barberId)
  const otherBarberId = await id(sql`
    INSERT INTO users (email, role) VALUES (${'integration-other-' + tag + '@example.invalid'}, 'barber') RETURNING id
  `)
  users.push(otherBarberId)
  const assignedId = await id(sql`
    INSERT INTO barbers (name, slug, location_id, user_id)
    VALUES ('Integration Barber', ${'integration-' + tag}, 1, ${barberId}) RETURNING id
  `)
  barbers.push(assignedId)
  const otherId = await id(sql`
    INSERT INTO barbers (name, slug, location_id, user_id)
    VALUES ('Other Integration Barber', ${'integration-other-' + tag}, 1, ${otherBarberId}) RETURNING id
  `)
  barbers.push(otherId)

  const admin = { id: adminId, role: 'admin' }
  const assigned = { id: barberId, role: 'barber' }
  const unrelated = { id: otherBarberId, role: 'barber' }
  const first = await createdBooking(assignedId, '2040-01-02T09:00:00Z')
  const second = await createdBooking(assignedId, '2040-01-02T11:00:00Z')
  const third = await createdBooking(otherId, '2040-01-02T13:00:00Z')

  await denied(first, unrelated, 'confirmed', 404)
  await denied(third, assigned, 'confirmed', 404)
  await denied(first, { id: adminId, role: 'customer' }, 'confirmed', 404)
  await denied(first, assigned, 'completed', 409)

  await changeBookingStatus({ payload, principal: assigned, bookingId: first, to: 'confirmed' })
  assert.equal(await status(first), 'confirmed')
  assert.deepEqual((await events(first)).map(e => [e.action, e.previous_status, Number(e.actor_id), e.actor_role]),
    [['confirmed', 'pending', barberId, 'assigned_barber']])
  await denied(first, assigned, 'confirmed', 409)
  await denied(first, assigned, 'completed', 409) // future appointment

  await changeBookingStatus({ payload, principal: admin, bookingId: first, to: 'cancelled', reason: 'integration test' })
  assert.equal(await status(first), 'cancelled')
  assert.deepEqual((await events(first)).map(e => [e.action, e.previous_status, Number(e.actor_id), e.actor_role]),
    [['confirmed', 'pending', barberId, 'assigned_barber'], ['cancelled', 'confirmed', adminId, 'admin']])
  await denied(first, admin, 'confirmed', 409)

  await changeBookingStatus({ payload, principal: admin, bookingId: second, to: 'confirmed' })
  await changeBookingStatus({ payload, principal: assigned, bookingId: second, to: 'completed', now: new Date('2040-01-02T12:00:00Z') })
  assert.equal(await status(second), 'completed')
  assert.equal((await events(second)).length, 2)
  await denied(second, admin, 'cancelled', 409)

  await changeBookingStatus({ payload, principal: unrelated, bookingId: third, to: 'confirmed' })
  await changeBookingStatus({ payload, principal: admin, bookingId: third, to: 'no_show', now: new Date('2040-01-02T14:00:00Z') })
  assert.equal(await status(third), 'no_show')
  assert.equal((await events(third)).length, 2)
  await denied(third, unrelated, 'cancelled', 409)

  // Two independent actors race to confirm the same pending booking.
  // The row lock must serialize them: exactly one succeeds and one gets 409.
  const raced = await createdBooking(assignedId, '2040-01-03T09:00:00Z')
  const race = await Promise.allSettled([
    changeBookingStatus({ payload, principal: admin, bookingId: raced, to: 'confirmed' }),
    changeBookingStatus({ payload, principal: assigned, bookingId: raced, to: 'confirmed' }),
  ])
  const successes = race.filter(item => item.status === 'fulfilled')
  const failures = race.filter(item => item.status === 'rejected')
  assert.equal(successes.length, 1, 'exactly one concurrent update must succeed')
  assert.equal(failures.length, 1, 'second concurrent update must be rejected')
  assert.ok(failures[0].status === 'rejected' &&
    failures[0].reason instanceof BookingManagementError &&
    failures[0].reason.statusCode === 409)
  assert.equal(await status(raced), 'confirmed')
  const raceEvents = await events(raced)
  assert.equal(raceEvents.length, 1, 'concurrent updates must write exactly one audit event')
  assert.equal(raceEvents[0].action, 'confirmed')
  assert.equal(raceEvents[0].previous_status, 'pending')
  assert.ok([adminId, barberId].includes(Number(raceEvents[0].actor_id)))

  // Competing terminal transitions must not produce two different outcomes.
  const terminalRace = await Promise.allSettled([
    changeBookingStatus({ payload, principal: admin, bookingId: raced, to: 'cancelled' }),
    changeBookingStatus({ payload, principal: assigned, bookingId: raced, to: 'completed',
      now: new Date('2040-01-03T10:00:00Z') }),
  ])
  assert.equal(terminalRace.filter(item => item.status === 'fulfilled').length, 1)
  const terminalFailure = terminalRace.find(item => item.status === 'rejected')
  assert.ok(terminalFailure?.status === 'rejected' &&
    terminalFailure.reason instanceof BookingManagementError &&
    terminalFailure.reason.statusCode === 409)
  assert.ok(['cancelled', 'completed'].includes(String(await status(raced))))
  assert.equal((await events(raced)).length, 2, 'one confirmation plus one terminal audit event')
  console.info('PASS: concurrent status updates serialize correctly and never duplicate audit events')

  console.info('PASS: admin/barber ownership, transitions, terminal states, deadlines and atomic audit events')
} finally {
  // FK order: events -> bookings -> barbers -> users. Never touch pre-existing IDs.
  for (const bookingId of bookings) {
    await db.execute(sql`DELETE FROM booking_events WHERE booking_id = ${bookingId}`)
    await db.execute(sql`DELETE FROM bookings WHERE id = ${bookingId}`)
  }
  for (const barberId of barbers) await db.execute(sql`DELETE FROM barbers WHERE id = ${barberId}`)
  for (const userId of users) await db.execute(sql`DELETE FROM users WHERE id = ${userId}`)
  console.info('Fixture cleanup completed')
}
}

// Payload's PostgreSQL pool can keep Node's event loop alive after assertions.
// Explicitly exit only after fixture cleanup and propagate test failures.
run().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
