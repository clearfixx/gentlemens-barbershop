import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import { prepareBookingRequest } from './booking-request.ts'
import { loadBookingCatalog } from './load-booking-catalog.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7],
  startsAt: '2030-01-02T09:00:00.000Z',
  customerName: 'Test Customer', customerPhone: '+380671234567',
}

test('loads authoritative barber offerings, branch and service pricing', async () => {
  const calls: Array<{ collection: string; id: number; overrideAccess: boolean }> = []
  const payload = {
    findByID: async (args: { collection: string; id: number; overrideAccess: boolean }) => {
      calls.push(args)
      if (args.collection === 'barbers') return {
        id: 3, location: 2, isActive: true,
        serviceOfferings: [{ service: 7, priceOverride: 650, durationOverrideMinutes: 60 }],
      }
      if (args.collection === 'locations') return { id: 2, isActive: true }
      if (args.collection === 'services') return {
        id: 7, isActive: true, price: 500, durationMinutes: 45,
      }
      throw Error('Unexpected collection')
    },
  } as unknown as Payload
  const catalog = await loadBookingCatalog(payload, request)
  const quote = prepareBookingRequest({ request, ...catalog })
  assert.equal(quote.totalPrice, 650)
  assert.equal(quote.durationMinutes, 60)
  assert.deepEqual(calls.map(call => call.collection).sort(), ['barbers', 'locations', 'services'])
  assert.ok(calls.every(call => call.overrideAccess))
})

test('rejects duplicate service IDs before querying Payload', async () => {
  let calls = 0
  const payload = { findByID: async () => { calls++; throw Error('Unexpected query') } } as unknown as Payload
  await assert.rejects(loadBookingCatalog(payload, { ...request, serviceIds: [7, 7] }), RangeError)
  assert.equal(calls, 0)
})
