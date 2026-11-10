import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBookingOffering } from './resolve-offering.ts'

const service = { id: 4, isActive: true, price: 500, durationMinutes: 45 }

test('uses the catalog base price and duration without overrides', () => {
  assert.deepEqual(resolveBookingOffering(service, [{ service: 4 }]), {
    serviceId: 4, price: 500, durationMinutes: 45,
  })
})

test('uses barber-specific price and duration overrides', () => {
  assert.deepEqual(resolveBookingOffering(service, [{
    service: { id: 4 }, priceOverride: 650, durationOverrideMinutes: 60,
  }]), { serviceId: 4, price: 650, durationMinutes: 60 })
})

test('accepts a zero-price promotion without treating it as missing', () => {
  assert.equal(resolveBookingOffering(service, [{ service: 4, priceOverride: 0 }]).price, 0)
})

test('rejects inactive services and unoffered services', () => {
  assert.throws(() => resolveBookingOffering({ ...service, isActive: false }, [{ service: 4 }]), RangeError)
  assert.throws(() => resolveBookingOffering(service, [{ service: 8 }]), RangeError)
})

test('rejects invalid catalog money and duration values', () => {
  assert.throws(() => resolveBookingOffering(service, [{ service: 4, priceOverride: -1 }]), RangeError)
  assert.throws(() => resolveBookingOffering(service, [{ service: 4, durationOverrideMinutes: 0 }]), RangeError)
  assert.throws(() => resolveBookingOffering({ ...service, price: 10.5 }, [{ service: 4 }]), RangeError)
})


test('rejects ambiguous duplicate barber offerings instead of choosing a price', () => {
  assert.throws(() => resolveBookingOffering(service, [
    { service: 4, priceOverride: 400 },
    { service: { id: 4 }, priceOverride: 700 },
  ]), /ambiguous/)
})

test('rejects invalid service identity and malformed offerings', () => {
  assert.throws(() => resolveBookingOffering({ ...service, id: 0 }, [{ service: 0 }]), RangeError)
  assert.throws(() => resolveBookingOffering(service, null as never), RangeError)
  assert.throws(() => resolveBookingOffering(service, [null] as never), RangeError)
})
