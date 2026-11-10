import assert from 'node:assert/strict'
import test from 'node:test'
import { createBooking } from './create-booking.ts'
import { BookingSlotConflictError } from './booking-errors.ts'

const request = {
  barberId: 3, locationId: 2, serviceIds: [7],
  startsAt: '2030-01-02T09:00:00.000Z',
  customerName: 'Customer', customerPhone: '+380671234567',
}
const catalog = {
  barber: { id: 3, locationId: 2, isActive: true, offerings: [{ service: 7 }] },
  location: { id: 2, isActive: true },
  services: [{ id: 7, isActive: true, price: 500, durationMinutes: 45 }],
}
const slot = {
  startsAt: '2030-01-02T09:00:00.000Z',
  endsAt: '2030-01-02T09:45:00.000Z',
  localStartMinute: 540,
}

test('persists only the server-derived quote after an available slot check', async () => {
  let persisted = false
  const result = await createBooking({
    request,
    loadCatalog: async () => catalog,
    loadAvailableSlots: async quote => {
      assert.equal(quote.totalPrice, 500)
      assert.equal(quote.durationMinutes, 45)
      return [slot]
    },
    persist: async quote => {
      persisted = true
      assert.equal(quote.endsAt, slot.endsAt)
      return { id: 42 }
    },
  })
  assert.deepEqual(result, { id: 42 })
  assert.equal(persisted, true)
})

test('does not persist when the requested slot is no longer available', async () => {
  let persisted = false
  await assert.rejects(createBooking({
    request, loadCatalog: async () => catalog,
    loadAvailableSlots: async () => [],
    persist: async () => { persisted = true },
  }), RangeError)
  assert.equal(persisted, false)
})

test('maps only the expected database overlap violation to a slot conflict', async () => {
  await assert.rejects(createBooking({
    request, loadCatalog: async () => catalog,
    loadAvailableSlots: async () => [slot],
    persist: async () => { throw { code: '23P01', constraint: 'bookings_no_active_overlap' } },
  }), BookingSlotConflictError)
})

test('preserves unrelated persistence errors for diagnostics', async () => {
  const failure = new Error('Connection failed')
  await assert.rejects(createBooking({
    request, loadCatalog: async () => catalog,
    loadAvailableSlots: async () => [slot],
    persist: async () => { throw failure },
  }), error => error === failure)
})

test('rejects malformed input without performing catalog I/O', async () => {
  let calls = 0
  for (const bad of [null, {}, { ...request, customerName: 12 },
    { ...request, startsAt: 'invalid' }, { ...request, serviceIds: [7, 7] }]) {
    await assert.rejects(createBooking({
      request: bad as never,
      loadCatalog: async () => { calls++; return catalog },
      loadAvailableSlots: async () => [slot],
      persist: async () => ({ id: 1 }),
    }), RangeError)
  }
  assert.equal(calls, 0)
})

test('concurrent attempts both pass advisory availability but database conflict rejects one', async () => {
  // Simulates the required database exclusion guarantee, not a PostgreSQL integration test.
  let entered = 0
  let releaseBoth: (() => void) | undefined
  const barrier = new Promise<void>(resolve => { releaseBoth = resolve })
  let reserved = false
  let successfulWrites = 0
  let availabilityReads = 0
  const attempt = () => createBooking({
    request,
    loadCatalog: async () => catalog,
    loadAvailableSlots: async () => {
      availabilityReads++
      return [slot]
    },
    persist: async () => {
      entered++
      if (entered === 2) releaseBoth?.()
      await barrier
      if (reserved) throw { code: '23P01', constraint: 'bookings_no_active_overlap' }
      reserved = true
      successfulWrites++
      return { id: 42 }
    },
  })
  const results = await Promise.allSettled([attempt(), attempt()])
  assert.equal(availabilityReads, 2)
  assert.equal(successfulWrites, 1)
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = results.find(result => result.status === 'rejected')
  assert.ok(rejected && rejected.status === 'rejected')
  assert.ok(rejected.reason instanceof BookingSlotConflictError)
})

test('concurrent booking does not hide unrelated persistence failures', async () => {
  const failure = { code: '40001', message: 'serialization failure' }
  await assert.rejects(createBooking({
    request,
    loadCatalog: async () => catalog,
    loadAvailableSlots: async () => [slot],
    persist: async () => { throw failure },
  }), error => error === failure)
})

test('caller mutation during asynchronous catalog lookup cannot change booking intent', async () => {
  const mutable = { ...request, serviceIds: [...request.serviceIds] }
  let releaseCatalog: (() => void) | undefined
  let catalogStarted: (() => void) | undefined
  const started = new Promise<void>(resolve => { catalogStarted = resolve })
  const waitForCatalog = new Promise<void>(resolve => { releaseCatalog = resolve })
  const operation = createBooking({
    request: mutable,
    loadCatalog: async received => {
      // Even the catalog loader must not receive a reference to the snapshot.
      received.serviceIds.push(999)
      catalogStarted?.()
      await waitForCatalog
      return catalog
    },
    loadAvailableSlots: async quote => {
      assert.deepEqual(quote.serviceIds, [7])
      assert.equal(quote.customerName, 'Customer')
      assert.equal(quote.startsAt, request.startsAt)
      return [slot]
    },
    persist: async quote => ({ serviceIds: quote.serviceIds, customerName: quote.customerName }),
  })
  await started
  mutable.serviceIds[0] = 8
  mutable.customerName = 'Changed after validation'
  mutable.startsAt = '2030-01-02T11:00:00.000Z'
  releaseCatalog?.()
  const result = await operation
  assert.deepEqual(result, { serviceIds: [7], customerName: 'Customer' })
})

test('invalid request still fails before any asynchronous catalog call', async () => {
  let calls = 0
  const invalid = { ...request, serviceIds: [7, 7] }
  await assert.rejects(createBooking({
    request: invalid,
    loadCatalog: async () => { calls++; return catalog },
    loadAvailableSlots: async () => [slot],
    persist: async () => ({ id: 1 }),
  }), RangeError)
  assert.equal(calls, 0)
})

test('availability adapter cannot mutate the authoritative quote before persistence', async () => {
  let saved: unknown
  const result = await createBooking({
    request,
    loadCatalog: async () => catalog,
    loadAvailableSlots: async quote => {
      quote.serviceIds[0] = 999
      quote.customerName = 'Changed by availability adapter'
      quote.startsAt = '2030-01-02T11:00:00.000Z'
      quote.totalPrice = 0
      return [slot]
    },
    persist: async quote => {
      saved = quote
      return { id: 42 }
    },
  })
  assert.equal(result.id, 42)
  assert.deepEqual(saved, {
    barberId: 3, locationId: 2, serviceIds: [7],
    startsAt: slot.startsAt, endsAt: slot.endsAt,
    totalPrice: 500, durationMinutes: 45,
    customerName: 'Customer', customerPhone: '+380671234567',
  })
})
