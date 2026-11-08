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
