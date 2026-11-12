import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateWeeklyShifts } from './validate-weekly-shifts.ts'

test('accepts adjacent shifts and different weekdays', () => {
  assert.doesNotThrow(() => validateWeeklyShifts([
    { weekday: '1', startMinute: 540, endMinute: 720 },
    { weekday: '1', startMinute: 720, endMinute: 1080 },
    { weekday: '2', startMinute: 600, endMinute: 800 },
  ]))
  assert.doesNotThrow(() => validateWeeklyShifts([]))
})

test('rejects overlap independent of input order', () => {
  assert.throws(() => validateWeeklyShifts([
    { weekday: '1', startMinute: 650, endMinute: 800 },
    { weekday: '1', startMinute: 540, endMinute: 700 },
  ]), /overlap/)
})

test('rejects incomplete, malformed and out-of-range shifts', () => {
  for (const value of [
    {}, [null], [{ weekday: '1', startMinute: 540 }],
    [{ weekday: '7', startMinute: 540, endMinute: 720 }],
    [{ weekday: '1', startMinute: -1, endMinute: 720 }],
    [{ weekday: '1', startMinute: 540.5, endMinute: 720 }],
    [{ weekday: '1', startMinute: 720, endMinute: 720 }],
    [{ weekday: '1', startMinute: 540, endMinute: 1441 }],
  ]) assert.throws(() => validateWeeklyShifts(value))
})
