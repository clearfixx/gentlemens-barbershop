import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareBookingRequest } from './booking-request.ts'

const fixture = () => ({
  request: {
    barberId: 3, locationId: 2, serviceIds: [7, 8],
    startsAt: '2030-01-02T09:00:00.000Z',
    customerName: '  Test Customer  ', customerPhone: '+380 67 123 45 67',
  },
  barber: {
    id: 3, locationId: 2, isActive: true,
    offerings: [{ service: 7, priceOverride: 650, durationOverrideMinutes: 60 }, { service: 8 }],
  },
  location: { id: 2, isActive: true },
  services: [
    { id: 7, isActive: true, price: 500, durationMinutes: 45 },
    { id: 8, isActive: true, price: 250, durationMinutes: 30 },
  ],
})

test('calculates a contiguous multi-service duration and server-side price', () => {
  const result = prepareBookingRequest(fixture())
  assert.equal(result.totalPrice, 900)
  assert.equal(result.durationMinutes, 90)
  assert.equal(result.endsAt, '2030-01-02T10:30:00.000Z')
  assert.equal(result.customerName, 'Test Customer')
})

test('rejects duplicate services and missing service offerings', () => {
  const duplicate = fixture()
  duplicate.request.serviceIds = [7, 7]
  assert.throws(() => prepareBookingRequest(duplicate), RangeError)
  const missing = fixture()
  missing.barber.offerings = [{ service: 7 }]
  assert.throws(() => prepareBookingRequest(missing), RangeError)
})

test('rejects inactive barber or mismatched branch', () => {
  const inactive = fixture()
  inactive.barber.isActive = false
  assert.throws(() => prepareBookingRequest(inactive), RangeError)
  const mismatch = fixture()
  mismatch.barber.locationId = 100
  assert.throws(() => prepareBookingRequest(mismatch), RangeError)
})

test('rejects malformed customer data and ambiguous dates', () => {
  const badPhone = fixture()
  badPhone.request.customerPhone = 'abc'
  assert.throws(() => prepareBookingRequest(badPhone), RangeError)
  const badDate = fixture()
  badDate.request.startsAt = '2030-01-02T09:00:00'
  assert.throws(() => prepareBookingRequest(badDate), RangeError)
})

test('rejects impossible or normalized UTC dates', () => {
  for (const startsAt of [
    '2030-02-30T09:00:00.000Z',
    '2030-01-02T24:00:00.000Z',
    '2030-01-02T09:00:60.000Z',
  ]) {
    const input = fixture()
    input.request.startsAt = startsAt
    assert.throws(() => prepareBookingRequest(input), RangeError, startsAt)
  }
})

test('accepts valid UTC timestamps with or without zero milliseconds', () => {
  const input = fixture()
  input.request.startsAt = '2030-01-02T09:00:00Z'
  assert.equal(prepareBookingRequest(input).startsAt, '2030-01-02T09:00:00.000Z')
})

test('rejects invalid runtime request shapes before dereferencing fields', () => {
  for (const value of [null, [], {}, { ...fixture().request, startsAt: null },
    { ...fixture().request, customerName: 42 },
    { ...fixture().request, customerPhone: {} },
    { ...fixture().request, customerEmail: [] },
    { ...fixture().request, serviceIds: [7, '8'] },
    { ...fixture().request, serviceIds: new Array(100).fill(7) },
  ]) {
    assert.throws(() => prepareBookingRequest({ ...fixture(), request: value as never }), RangeError)
  }
})


test('rejects duplicate catalog records instead of using an arbitrary service price', () => {
  const input = fixture()
  input.services.push({ id: 7, isActive: true, price: 999, durationMinutes: 30 })
  assert.throws(() => prepareBookingRequest(input), /ambiguous service/)
})

test('rejects duplicate barber offerings with conflicting overrides', () => {
  const input = fixture()
  input.barber.offerings.push({ service: 7, priceOverride: 999, durationOverrideMinutes: 30 })
  assert.throws(() => prepareBookingRequest(input), /ambiguous barber offering/)
})
