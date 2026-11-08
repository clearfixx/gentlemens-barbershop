import assert from 'node:assert/strict'
import test from 'node:test'
import { blockedMinutesForLocalDay, localDayMinute, utcInstantsForLocalMinute } from './local-time.ts'

test('uses Europe/Kyiv local time instead of a fixed UTC offset', () => {
  assert.deepEqual(localDayMinute(new Date('2026-01-15T08:00:00Z'), 'Europe/Kyiv'), { date: '2026-01-15', minute: 600 })
  assert.deepEqual(localDayMinute(new Date('2026-07-15T07:00:00Z'), 'Europe/Kyiv'), { date: '2026-07-15', minute: 600 })
})

test('splits a UTC interval at the local midnight boundary', () => {
  assert.deepEqual(blockedMinutesForLocalDay(
    new Date('2026-01-15T21:30:00Z'), new Date('2026-01-15T22:30:00Z'),
    '2026-01-15', 'Europe/Kyiv',
  ), [{ startMinute: 1410, endMinute: 1440 }])
  assert.deepEqual(blockedMinutesForLocalDay(
    new Date('2026-01-15T21:30:00Z'), new Date('2026-01-15T22:30:00Z'),
    '2026-01-16', 'Europe/Kyiv',
  ), [{ startMinute: 0, endMinute: 30 }])
})

test('includes both repeated local hours on autumn DST transition', () => {
  const blocked = blockedMinutesForLocalDay(
    new Date('2026-10-25T00:30:00Z'), new Date('2026-10-25T01:30:00Z'),
    '2026-10-25', 'Europe/Kyiv',
  )
  assert.deepEqual(blocked, [{ startMinute: 180, endMinute: 210 }])
})

test('marks the entire repeated hour when both UTC occurrences are blocked', () => {
  assert.deepEqual(blockedMinutesForLocalDay(
    new Date('2026-10-25T00:00:00Z'), new Date('2026-10-25T02:00:00Z'),
    '2026-10-25', 'Europe/Kyiv',
  ), [{ startMinute: 180, endMinute: 240 }])
})

test('rejects invalid intervals', () => {
  assert.throws(() => blockedMinutesForLocalDay(
    new Date('2026-01-01'), new Date('2025-12-31'), '2026-01-01', 'Europe/Kyiv',
  ), RangeError)
})

test('resolves normal, missing, and repeated Kyiv wall-clock minutes', () => {
  assert.deepEqual(
    utcInstantsForLocalMinute('2026-01-15', 600, 'Europe/Kyiv').map(value => value.toISOString()),
    ['2026-01-15T08:00:00.000Z'],
  )
  assert.deepEqual(utcInstantsForLocalMinute('2026-03-29', 210, 'Europe/Kyiv'), [])
  assert.deepEqual(
    utcInstantsForLocalMinute('2026-10-25', 210, 'Europe/Kyiv').map(value => value.toISOString()),
    ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'],
  )
})

test('rejects impossible calendar dates and minutes', () => {
  assert.throws(() => utcInstantsForLocalMinute('2026-02-30', 600, 'Europe/Kyiv'), RangeError)
  assert.throws(() => utcInstantsForLocalMinute('2026-01-15', 1440, 'Europe/Kyiv'), RangeError)
})
