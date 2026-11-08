import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { createIdempotentPayloadBooking, createPayloadBooking } from '../src/lib/booking/payload-booking-service.ts'

async function main() {
  const locationId = Number(process.env.CI_LOCATION_ID)
  const barberId = Number(process.env.CI_BARBER_ID)
  const serviceId = Number(process.env.CI_SERVICE_ID)
  assert.ok([locationId, barberId, serviceId].every(id => Number.isSafeInteger(id) && id > 0))
  const payload = await getPayload({ config })
  // The fixture location has no timezone override; configure a real IANA zone.
  await payload.update({
    collection: 'locations', id: locationId, overrideAccess: true,
    data: { timeZone: 'Europe/Kyiv' },
  })
  const localDate = '2037-01-02'
  const weekday = String(new Date(localDate + 'T00:00:00.000Z').getUTCDay())
  await payload.create({
    collection: 'barber-schedules', overrideAccess: true,
    data: {
      label: 'CI booking service shift', barber: barberId, isActive: true,
      weeklyShifts: [{ weekday, startMinute: 540, endMinute: 1080 }],
    },
  })
  const request = {
    locationId, barberId, serviceIds: [serviceId],
    startsAt: '2037-01-02T09:00:00.000Z',
    customerName: 'CI trusted booking', customerPhone: '+380671234567',
  }
  const created = await createPayloadBooking(payload, request)
  assert.equal(created.totalPrice, 650)
  assert.equal(created.startsAt, request.startsAt)
  assert.equal(created.endsAt, '2037-01-02T10:00:00.000Z')
  assert.equal(created.status, 'pending')
  await assert.rejects(createPayloadBooking(payload, request), {
    name: 'RangeError', message: 'Selected booking slot is unavailable',
  })
  const saved = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: { and: [
      { barber: { equals: barberId } },
      { startsAt: { equals: request.startsAt } },
    ] },
  })
  assert.equal(saved.totalDocs, 1)
  assert.equal(saved.docs[0]?.id, created.id)
  const retryRequest = { ...request, startsAt: '2037-01-02T11:00:00.000Z' }
  const firstRetry = await createIdempotentPayloadBooking(payload, retryRequest, 'ci:customer:retry', 'stable-key')
  assert.equal(firstRetry.replayed, false)
  const repeated = await createIdempotentPayloadBooking(payload, retryRequest, 'ci:customer:retry', 'stable-key')
  assert.equal(repeated.replayed, true)
  assert.equal(repeated.booking.id, firstRetry.booking.id)
  await assert.rejects(
    createIdempotentPayloadBooking(payload, { ...retryRequest, customerName: 'Different customer' }, 'ci:customer:retry', 'stable-key'),
    { name: 'BookingIdempotencyConflictError' },
  )
  // Race two complete booking requests, not just direct persistence calls.
  // The PostgreSQL uniqueness/exclusion constraints must converge them on
  // exactly one booking, with the other response marked as a replay.
  const racingRequest = { ...request, startsAt: '2037-01-02T13:00:00.000Z' }
  const racing = await Promise.all([
    createIdempotentPayloadBooking(payload, racingRequest, 'ci:customer:race', 'simultaneous-key'),
    createIdempotentPayloadBooking(payload, racingRequest, 'ci:customer:race', 'simultaneous-key'),
  ])
  assert.equal(racing[0].booking.id, racing[1].booking.id)
  assert.deepEqual(racing.map(item => item.replayed).sort(), [false, true])
  const racingStored = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: { and: [
      { idempotencyScope: { equals: 'ci:customer:race' } },
      { idempotencyKey: { equals: 'simultaneous-key' } },
    ] },
  })
  assert.equal(racingStored.totalDocs, 1)
  // A reused key must not turn two different concurrent requests into
  // a successful replay. Exactly one may create the booking.
  const mismatchedRequest = { ...request, startsAt: '2037-01-02T15:00:00.000Z' }
  const mismatchedResults = await Promise.allSettled([
    createIdempotentPayloadBooking(payload, mismatchedRequest, 'ci:customer:mismatch', 'same-key'),
    createIdempotentPayloadBooking(payload, { ...mismatchedRequest, customerName: 'Different customer' }, 'ci:customer:mismatch', 'same-key'),
  ])
  const mismatchedSuccesses = mismatchedResults.filter(result => result.status === 'fulfilled')
  const mismatchedFailures = mismatchedResults.filter(result => result.status === 'rejected')
  assert.equal(mismatchedSuccesses.length, 1)
  assert.equal(mismatchedFailures.length, 1)
  assert.equal(mismatchedFailures[0].reason?.name, 'BookingIdempotencyConflictError')
  const mismatchedStored = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: { and: [
      { idempotencyScope: { equals: 'ci:customer:mismatch' } },
      { idempotencyKey: { equals: 'same-key' } },
    ] },
  })
  assert.equal(mismatchedStored.totalDocs, 1)
  console.info('Trusted booking service: catalog, schedule, persistence and duplicate-slot rejection verified')
}

main().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
