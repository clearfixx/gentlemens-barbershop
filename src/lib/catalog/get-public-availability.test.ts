import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import { getPublicAvailability } from './get-public-availability.ts'

const date = '2037-01-02'
const weekday = String(new Date(date + 'T00:00:00Z').getUTCDay())
const barber = {
  id: 2, isActive: true, location: 1,
  serviceOfferings: [
    { service: 3, durationOverrideMinutes: 30, priceOverride: 650 },
    { service: 4, durationOverrideMinutes: 60, priceOverride: 400 },
  ],
}
const services = [
  { id: 3, isActive: true, durationMinutes: 45, price: 500 },
  { id: 4, isActive: true, durationMinutes: 45, price: 300 },
]
const location = { id: 1, isActive: true, timeZone: 'UTC' }

function catalog(input: { services?: typeof services; barber?: typeof barber; location?: typeof location } = {}) {
  let scheduleQueries = 0
  const records = {
    barbers: [input.barber ?? barber],
    services: input.services ?? services,
    locations: [input.location ?? location],
  }
  const payload = {
    findByID: async ({ collection, id }: { collection: keyof typeof records; id: number }) =>
      records[collection].find(record => record.id === id) ?? null,
    find: async ({ collection }: { collection: string }) => {
      if (collection === 'barber-schedules') {
        scheduleQueries++
        return {
          docs: [{
            weeklyShifts: [{ weekday, startMinute: 540, endMinute: 660 }],
          }],
          hasNextPage: false,
        }
      }
      return { docs: [], hasNextPage: false }
    },
  } as unknown as Payload
  return { payload, scheduleQueries: () => scheduleQueries }
}

test('combined availability uses summed trusted overrides and full slot duration', async () => {
  const { payload } = catalog()
  const combined = await getPublicAvailability(payload, {
    barberId: 2, serviceIds: [3, 4], date,
  })
  assert.ok(combined)
  assert.deepEqual(combined.serviceIds, [3, 4])
  assert.equal(combined.durationMinutes, 90)
  assert.equal(combined.price, 1050)
  assert.ok(!('serviceId' in combined))
  assert.ok(combined.slots.length > 0)
  assert.ok(combined.slots.every(slot =>
    Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 90 * 60_000))
  const single = await getPublicAvailability(payload, {
    barberId: 2, serviceIds: [3], date,
  })
  assert.ok(single)
  assert.equal(single.serviceId, 3)
  assert.deepEqual(single.serviceIds, [3])
  assert.equal(single.price, 650)
  assert.equal(single.durationMinutes, 30)
  assert.ok(single.slots.length > combined.slots.length,
    'shorter service must have more available starts in the same shift')
})

test('entire combination unavailable when any service is inactive or unoffered', async () => {
  const inactive = catalog({ services: [services[0], { ...services[1], isActive: false }] })
  assert.equal(await getPublicAvailability(inactive.payload, {
    barberId: 2, serviceIds: [3, 4], date,
  }), null)
  assert.equal(inactive.scheduleQueries(), 0)

  const unsupported = catalog({
    barber: { ...barber, serviceOfferings: barber.serviceOfferings.slice(0, 1) },
  })
  assert.equal(await getPublicAvailability(unsupported.payload, {
    barberId: 2, serviceIds: [3, 4], date,
  }), null)
  assert.equal(unsupported.scheduleQueries(), 0)
})

test('rejects combinations longer than eight hours before slot queries', async () => {
  const longServices = Array.from({ length: 9 }, (_, index) =>
    ({ id: index + 10, isActive: true, price: 500, durationMinutes: 60 }))
  const veryLong = catalog({
    services: longServices,
    barber: {
      ...barber,
      serviceOfferings: longServices.map(item => ({ service: item.id })),
    },
  })
  assert.equal(await getPublicAvailability(veryLong.payload, {
    barberId: 2, serviceIds: longServices.map(service => service.id), date,
  }), null)
  assert.equal(veryLong.scheduleQueries(), 0)
})
