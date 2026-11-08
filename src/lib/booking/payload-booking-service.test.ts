import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import { createPayloadBooking } from './payload-booking-service.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7],
  // UTC previous day, but already the next calendar day in Kyiv.
  startsAt: '2030-01-01T22:30:00.000Z',
  customerName: 'Customer', customerPhone: '+380671234567',
}

test('uses the branch local date and persists a trusted quote', async () => {
  const queries: string[] = []
  let created: Record<string, unknown> | undefined
  const payload = {
    findByID: async ({ collection }: { collection: string }) => {
      if (collection === 'barbers') return {
        id: 3, location: 2, isActive: true,
        serviceOfferings: [{ service: 7, priceOverride: 650, durationOverrideMinutes: 60 }],
      }
      if (collection === 'locations') return {
        id: 2, isActive: true, timeZone: 'Europe/Kyiv',
      }
      if (collection === 'services') return {
        id: 7, isActive: true, price: 500, durationMinutes: 45,
      }
      throw Error('Unexpected collection')
    },
    find: async ({ collection }: { collection: string }) => {
      queries.push(collection)
      if (collection === 'barber-schedules') return {
        docs: [{ weeklyShifts: [{ weekday: '3', startMinute: 0, endMinute: 180 }] }],
        hasNextPage: false,
      }
      return { docs: [], hasNextPage: false }
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      created = data
      return { id: 99, ...data }
    },
  } as unknown as Payload
  const booking = await createPayloadBooking(payload, request)
  assert.equal(booking.id, 99)
  assert.equal(created?.startsAt, request.startsAt)
  assert.equal(created?.endsAt, '2030-01-01T23:30:00.000Z')
  assert.equal(created?.totalPrice, 650)
  assert.deepEqual(queries.sort(), ['barber-schedules', 'barber-time-off', 'bookings'])
})
