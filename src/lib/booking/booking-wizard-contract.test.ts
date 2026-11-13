import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bookingLocalDateWindow, isBookingWizardAvailability, isBookingWizardReceipt,
} from './booking-wizard-contract.ts'

const selection = { barberId: 4, locationId: 2, serviceIds: [3, 7], date: '2037-01-02' }
const availability = {
  ...selection, timeZone: 'Europe/Kyiv', price: 1200, durationMinutes: 90,
  slots: [{
    startsAt: '2037-01-02T09:00:00.000Z',
    endsAt: '2037-01-02T10:30:00.000Z',
  }],
}

test('calendar window uses shop time zone around UTC and DST boundaries', () => {
  assert.deepEqual(bookingLocalDateWindow('2026-11-13T22:30:00.000Z', 'Europe/Kyiv'), {
    today: '2026-11-14', maxDate: '2026-12-14',
  })
  assert.deepEqual(bookingLocalDateWindow('2026-03-28T22:30:00.000Z', 'Europe/Kyiv'), {
    today: '2026-03-29', maxDate: '2026-04-28',
  })
  assert.deepEqual(bookingLocalDateWindow('2026-11-13T01:00:00.000Z', 'America/Los_Angeles'), {
    today: '2026-11-12', maxDate: '2026-12-12',
  })
  assert.throws(() => bookingLocalDateWindow('not-a-date', 'Europe/Kyiv'), RangeError)
  assert.throws(() => bookingLocalDateWindow('2026-11-13T00:00:00Z', 'Invalid/Zone'), RangeError)
})

test('accepts only matching selection with canonical complete UTC slots', () => {
  assert.equal(isBookingWizardAvailability(availability, selection), true)
  assert.equal(isBookingWizardAvailability({ ...availability, slots: [] }, selection), true)
  assert.equal(isBookingWizardAvailability({ ...availability, serviceIds: [7, 3] }, selection), false)
  assert.equal(isBookingWizardAvailability({ ...availability, locationId: 99 }, selection), false)
  assert.equal(isBookingWizardAvailability({ ...availability, date: '2037-01-03' }, selection), false)
  assert.equal(isBookingWizardAvailability({ ...availability, timeZone: 'invalid/zone' }, selection), false)
  assert.equal(isBookingWizardAvailability({ ...availability, price: -1 }, selection), false)
  assert.equal(isBookingWizardAvailability({
    ...availability, slots: [{ ...availability.slots[0], endsAt: '2037-01-02T09:30:00.000Z' }],
  }, selection), false)
  assert.equal(isBookingWizardAvailability({
    ...availability, slots: [{ ...availability.slots[0], startsAt: '2037-01-02T09:00:00Z' }],
  }, selection), false)
})

test('receipt validation requires a safe positive ID and explicit replay flag', () => {
  assert.equal(isBookingWizardReceipt({ id: 7, replayed: false }), true)
  assert.equal(isBookingWizardReceipt({ id: 7, replayed: true }), true)
  for (const bad of [null, [], {}, { id: '7', replayed: false },
    { id: 0, replayed: false }, { id: 1.5, replayed: false },
    { id: 7, replayed: 'false' }]) {
    assert.equal(isBookingWizardReceipt(bad), false)
  }
})
