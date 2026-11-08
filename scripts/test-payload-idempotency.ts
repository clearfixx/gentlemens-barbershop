import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { persistIdempotentPayloadBooking } from '../src/lib/booking/payload-idempotency.ts'
import { BookingIdempotencyConflictError } from '../src/lib/booking/idempotency.ts'
import type { BookingQuote } from '../src/lib/booking/booking-request.ts'

async function main() {
  const locationId = Number(process.env.CI_LOCATION_ID)
  const barberId = Number(process.env.CI_BARBER_ID)
  const serviceId = Number(process.env.CI_SERVICE_ID)
  assert.ok([locationId, barberId, serviceId].every(id => Number.isSafeInteger(id) && id > 0))
  const payload = await getPayload({ config })
  const quote: BookingQuote = {
    locationId, barberId, serviceIds: [serviceId],
    startsAt: '2036-01-02T09:00:00.000Z',
    endsAt: '2036-01-02T10:00:00.000Z',
    durationMinutes: 60, totalPrice: 650,
    customerName: 'CI Local API idempotency',
    customerPhone: '+380671234567',
  }
  const token = {
    scope: 'ci:local-api',
    key: 'same-request-retry',
    requestHash: 'a'.repeat(64),
  }
  const first = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(first.replayed, false)
  const second = await persistIdempotentPayloadBooking(payload, quote, token)
  assert.equal(second.replayed, true)
  assert.equal(second.booking.id, first.booking.id)

  const stored = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: { idempotencyScope: { equals: token.scope } },
  })
  assert.equal(stored.totalDocs, 1)
  assert.equal(stored.docs[0]?.id, first.booking.id)
  assert.equal(stored.docs[0]?.idempotencyKey, token.key)
  assert.equal(stored.docs[0]?.idempotencyRequestHash, token.requestHash)

  await assert.rejects(
    persistIdempotentPayloadBooking(payload, quote, { ...token, requestHash: 'b'.repeat(64) }),
    BookingIdempotencyConflictError,
  )
  // Two simultaneous Local API requests with one fresh key must converge on
  // one persisted booking. The PostgreSQL unique index is the arbiter.
  const concurrentToken = { ...token, key: 'concurrent-retry' }
  const concurrentQuote: BookingQuote = {
    ...quote,
    startsAt: '2036-01-03T09:00:00.000Z',
    endsAt: '2036-01-03T10:00:00.000Z',
  }
  const concurrent = await Promise.all([
    persistIdempotentPayloadBooking(payload, concurrentQuote, concurrentToken),
    persistIdempotentPayloadBooking(payload, concurrentQuote, concurrentToken),
  ])
  assert.equal(concurrent[0].booking.id, concurrent[1].booking.id)
  assert.deepEqual(concurrent.map(item => item.replayed).sort(), [false, true])
  const concurrentStored = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: {
      and: [
        { idempotencyScope: { equals: concurrentToken.scope } },
        { idempotencyKey: { equals: concurrentToken.key } },
      ],
    },
  })
  assert.equal(concurrentStored.totalDocs, 1)
  console.info('Payload Local API idempotency: persisted, replayed, rejected mismatched hash and converged concurrent retries')
}

main().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
