import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import { BookingSlotConflictError } from './booking-errors.ts'
import { persistPayloadBooking } from './persist-payload-booking.ts'

const quote: BookingQuote = {
  barberId: 3, locationId: 2, serviceIds: [7, 8],
  startsAt: '2030-01-02T09:00:00.000Z',
  endsAt: '2030-01-02T10:30:00.000Z',
  durationMinutes: 90, totalPrice: 900,
  customerName: 'Customer', customerPhone: '+380671234567',
}

test('persists a pending booking with server-derived fields only', async () => {
  let args: unknown
  const payload = {
    create: async (input: unknown) => {
      args = input
      return { id: 42 }
    },
  } as unknown as Payload
  const result = await persistPayloadBooking(payload, quote)
  assert.deepEqual(result, { id: 42 })
  assert.deepEqual(args, {
    collection: 'bookings', overrideAccess: true, depth: 0,
    data: {
      location: 2, barber: 3, services: [7, 8],
      customerName: 'Customer', customerPhone: '+380671234567',
      startsAt: quote.startsAt, endsAt: quote.endsAt,
      totalPrice: 900, status: 'pending',
    },
  })
})

test('includes optional customer email when provided', async () => {
  let args: { data: { customerEmail?: string } } | undefined
  const payload = {
    create: async (input: typeof args) => { args = input; return { id: 1 } },
  } as unknown as Payload
  await persistPayloadBooking(payload, { ...quote, customerEmail: 'customer@example.com' })
  assert.equal(args?.data.customerEmail, 'customer@example.com')
})

test('translates PostgreSQL overlap violations', async () => {
  const payload = {
    create: async () => { throw { code: '23P01', constraint: 'bookings_no_active_overlap' } },
  } as unknown as Payload
  await assert.rejects(persistPayloadBooking(payload, quote), BookingSlotConflictError)
})

test('does not hide unexpected database failures', async () => {
  const failure = new Error('Database unavailable')
  const payload = { create: async () => { throw failure } } as unknown as Payload
  await assert.rejects(persistPayloadBooking(payload, quote), error => error === failure)
})
