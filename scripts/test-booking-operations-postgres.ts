import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { getOwnBookingHistory } from '../src/lib/booking/get-own-booking-history.ts'
import { cancelOwnedBooking, BookingCancellationConflictError } from '../src/lib/booking/cancel-owned-booking.ts'
import {
  getOwnBarberBookings, changeOwnBarberBookingStatus, BarberBookingConflictError,
} from '../src/lib/booking/barber-booking-operations.ts'

/**
 * Run only against disposable CI data, after test-payload-booking-service.ts.
 * Exercises actual Payload relationships and conditional PostgreSQL UPDATEs.
 */
async function main() {
  if (process.env.CI_BOOKING_DB_TEST !== 'disposable') {
    throw new Error('Refusing booking operations test without disposable database acknowledgment')
  }
  const barberId = Number(process.env.CI_BARBER_ID)
  const locationId = Number(process.env.CI_LOCATION_ID)
  const serviceId = Number(process.env.CI_SERVICE_ID)
  if (![barberId, locationId, serviceId].every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new Error('Missing CI booking catalog fixture')
  }
  const payload = await getPayload({ config })

  const barberUser = await payload.create({
    collection: 'users', overrideAccess: true,
    data: {
      email: 'ci-booking-barber@example.invalid',
      password: 'ci-disposable-booking-barber-password',
      role: 'barber',
    },
  })
  const customerUser = await payload.create({
    collection: 'users', overrideAccess: true,
    data: {
      email: 'ci-booking-customer@example.invalid',
      password: 'ci-disposable-booking-customer-password',
      role: 'customer',
    },
  })
  const otherUser = await payload.create({
    collection: 'users', overrideAccess: true,
    data: {
      email: 'ci-booking-other@example.invalid',
      password: 'ci-disposable-booking-other-password',
      role: 'customer',
    },
  })
  await payload.update({
    collection: 'barbers', id: barberId, overrideAccess: true,
    data: { user: barberUser.id },
  })
  const barberActor = { id: Number(barberUser.id), role: 'barber' }
  const customerActor = { id: Number(customerUser.id), role: 'customer' }
  const otherActor = { id: Number(otherUser.id), role: 'customer' }

  const day = '2037-01-02'
  const assigned = await getOwnBarberBookings(payload, barberActor, { date: day, limit: 50 })
  assert.ok(assigned.bookings.length >= 2, 'Expected booked CI test appointments')
  assert.ok(assigned.bookings.every(booking => booking.customerName === 'CI trusted booking'))
  const pending = assigned.bookings.filter(booking => booking.status === 'pending')
  assert.ok(pending.length >= 2, 'Expected two pending fixtures')

  const forCustomer = pending.find(booking => booking.startsAt === day + 'T09:00:00.000Z')
  const forBarber = pending.find(booking => booking.startsAt === day + 'T11:00:00.000Z')
  assert.ok(forCustomer, 'Missing pending 09:00 fixture')
  assert.ok(forBarber, 'Missing pending 11:00 fixture')
  await payload.update({
    collection: 'bookings', id: forCustomer.id, overrideAccess: true,
    data: { customer: customerUser.id },
  })

  const history = await getOwnBookingHistory(payload, customerActor, { limit: 10 })
  assert.ok(history.bookings.some(booking => booking.id === forCustomer.id))
  assert.ok(history.bookings.every(booking => booking.id === forCustomer.id))
  assert.equal(JSON.stringify(history).includes('ci-booking-customer@example.invalid'), false)

  const foreignHistory = await getOwnBookingHistory(payload, otherActor)
  assert.equal(foreignHistory.bookings.length, 0)
  await assert.rejects(cancelOwnedBooking(payload, String(forCustomer.id), otherActor),
    BookingCancellationConflictError)

  const cancelled = await cancelOwnedBooking(payload, String(forCustomer.id), customerActor)
  assert.deepEqual(cancelled, { id: forCustomer.id, status: 'cancelled' })
  await assert.rejects(cancelOwnedBooking(payload, String(forCustomer.id), customerActor),
    BookingCancellationConflictError)
  const savedCancellation = await payload.findByID({
    collection: 'bookings', id: forCustomer.id, overrideAccess: true, depth: 0,
  })
  assert.equal(savedCancellation.status, 'cancelled')
  const cancellationEvents = await payload.find({
    collection: 'booking-events', overrideAccess: true, depth: 0,
    where: { booking: { equals: forCustomer.id } },
  })
  assert.equal(cancellationEvents.totalDocs, 1, 'One cancellation, one immutable audit event')
  assert.equal(cancellationEvents.docs[0]?.action, 'cancelled')
  assert.equal(cancellationEvents.docs[0]?.previousStatus, 'pending')
  assert.equal(cancellationEvents.docs[0]?.actor, customerUser.id)
  assert.equal(cancellationEvents.docs[0]?.actorRole, 'customer')

  // Enforce the configured shop cancellation window, not merely starts_at > NOW().
  const soonStart = new Date(Date.now() + 30 * 60_000)
  const soonEnd = new Date(soonStart.getTime() + 60 * 60_000)
  await payload.update({
    collection: 'locations', id: locationId, overrideAccess: true,
    data: { cancellationDeadlineMinutes: 60 },
  })
  const tooLate = await payload.create({
    collection: 'bookings', overrideAccess: true, depth: 0,
    data: {
      location: locationId, barber: barberId, services: [serviceId],
      customer: customerUser.id, customerName: 'CI deadline fixture',
      customerPhone: '+380671234567',
      startsAt: soonStart.toISOString(), endsAt: soonEnd.toISOString(),
      totalPrice: 650, status: 'pending',
    },
  })
  await assert.rejects(
    cancelOwnedBooking(payload, String(tooLate.id), customerActor),
    BookingCancellationConflictError,
  )
  const deadlineRecord = await payload.findByID({
    collection: 'bookings', id: tooLate.id, overrideAccess: true, depth: 0,
  })
  assert.equal(deadlineRecord.status, 'pending', 'Deadline rejection keeps booking active')
  const deadlineEvents = await payload.find({
    collection: 'booking-events', overrideAccess: true, depth: 0,
    where: { booking: { equals: tooLate.id } },
  })
  assert.equal(deadlineEvents.totalDocs, 0, 'Rejected cancellation must not append audit')

  const confirmed = await changeOwnBarberBookingStatus(
    payload, String(forBarber.id), 'confirmed', barberActor,
  )
  assert.deepEqual(confirmed, { id: forBarber.id, status: 'confirmed' })
  await assert.rejects(
    changeOwnBarberBookingStatus(payload, String(forBarber.id), 'confirmed', barberActor),
    BarberBookingConflictError,
  )
  await assert.rejects(
    changeOwnBarberBookingStatus(payload, String(forBarber.id), 'completed', barberActor),
    BarberBookingConflictError,
  )
  const stored = await payload.findByID({
    collection: 'bookings', id: forBarber.id, overrideAccess: true, depth: 0,
  })
  assert.equal(stored.status, 'confirmed')
  const barberEvents = await payload.find({
    collection: 'booking-events', overrideAccess: true, depth: 0,
    where: { booking: { equals: forBarber.id } },
  })
  assert.equal(barberEvents.totalDocs, 1, 'Repeated staff action must not duplicate audit')
  assert.equal(barberEvents.docs[0]?.action, 'confirmed')
  assert.equal(barberEvents.docs[0]?.previousStatus, 'pending')
  assert.equal(barberEvents.docs[0]?.actor, barberUser.id)
  assert.equal(barberEvents.docs[0]?.actorRole, 'assigned_barber')

  // A customer cancellation racing a barber confirmation must converge on
  // one status and exactly one event. A loser must report a conflict, never
  // append a second audit entry or silently overwrite the winner.
  const raceBooking = pending.find(booking => booking.startsAt === day + 'T13:00:00.000Z')
  assert.ok(raceBooking, 'Missing pending 13:00 race fixture')
  await payload.update({
    collection: 'bookings', id: raceBooking.id, overrideAccess: true,
    data: { customer: customerUser.id },
  })
  const contenders = await Promise.allSettled([
    cancelOwnedBooking(payload, String(raceBooking.id), customerActor),
    changeOwnBarberBookingStatus(payload, String(raceBooking.id), 'confirmed', barberActor),
  ])
  assert.equal(contenders.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(contenders.filter(result => result.status === 'rejected').length, 1)
  const raceRecord = await payload.findByID({
    collection: 'bookings', id: raceBooking.id, overrideAccess: true, depth: 0,
  })
  assert.ok(['cancelled', 'confirmed'].includes(raceRecord.status))
  const raceEvents = await payload.find({
    collection: 'booking-events', overrideAccess: true, depth: 0,
    where: { booking: { equals: raceBooking.id } },
  })
  assert.equal(raceEvents.totalDocs, 1, 'Concurrent operations must create one audit event')
  assert.equal(raceEvents.docs[0]?.action, raceRecord.status)
  assert.equal(raceEvents.docs[0]?.previousStatus, 'pending')
  console.info('Booking operations PostgreSQL integration passed: staff scope, history isolation, ownership, atomic cancellation and status CAS')
}

main().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
