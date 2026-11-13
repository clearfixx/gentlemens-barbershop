import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAvailabilityInput, resolvePublicDuration } from './public-availability.ts'

const now = new Date('2026-11-09T12:00:00.000Z')
const query = (value: string) => new URLSearchParams(value)

test('accepts one well-formed date and catalog IDs in the near future', () => {
  assert.deepEqual(parseAvailabilityInput(query('barber=2&service=3&date=2026-11-12'), now), {
    barberId: 2, serviceIds: [3], date: '2026-11-12',
  })
})

test('accepts multiple ordered services for a combined appointment', () => {
  assert.deepEqual(parseAvailabilityInput(query(
    'barber=2&service=3&service=4&date=2026-11-12',
  ), now), {
    barberId: 2, serviceIds: [3, 4], date: '2026-11-12',
  })
})

test('rejects duplicates, unknown fields, invalid dates, and distant dates', () => {
  for (const value of [
    'barber=1&barber=2&service=3&date=2026-11-12',
    'barber=1&service=3&date=2026-11-12&extra=x',
    'barber=1&service=3&service=3&date=2026-11-12',
    'barber=1&service=3&service=04&date=2026-11-12',
    'barber=1&service=3&service=0&date=2026-11-12',
    'barber=1&service=3&service=4&service=5&service=6&service=7&service=8&service=9&service=10&service=11&service=12&date=2026-11-12',
    'barber=0&service=3&date=2026-11-12',
    'barber=1&service=03&date=2026-11-12',
    'barber=1&service=3&date=2026-02-30',
    'barber=1&service=3&date=2027-01-01',
    'barber=1&service=3',
  ]) assert.throws(() => parseAvailabilityInput(query(value), now), RangeError)
})

test('uses trusted barber-specific duration and price', () => {
  const result = resolvePublicDuration(
    { isActive: true, serviceOfferings: [{ service: 3, durationOverrideMinutes: 45, priceOverride: 700 }] },
    { id: 3, isActive: true, durationMinutes: 30, price: 500 },
  )
  assert.equal(result.durationMinutes, 45)
  assert.equal(result.price, 700)
  assert.throws(() => resolvePublicDuration(
    { isActive: true, serviceOfferings: [] },
    { id: 3, isActive: true, durationMinutes: 30, price: 500 },
  ), RangeError)
})
