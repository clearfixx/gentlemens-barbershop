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
  if (!Number.isSafeInteger(barberId) || barberId <= 0) throw new Error('Missing CI barber')
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
  console.info('Booking operations PostgreSQL integration passed: staff scope, history isolation, ownership, atomic cancellation and status CAS')
}

main().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
