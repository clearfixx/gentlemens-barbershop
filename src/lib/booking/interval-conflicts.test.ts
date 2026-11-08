import assert from 'node:assert/strict'
import test from 'node:test'
import { hasAppointmentConflict, intervalsOverlap } from './interval-conflicts.ts'

const interval = (start: string, end: string) => ({
  startsAt: new Date(start),
  endsAt: new Date(end),
})

const booked = interval('2026-11-09T09:00:00Z', '2026-11-09T10:00:00Z')

test('rejects exact duplicates and partial or encompassing overlaps', () => {
  for (const candidate of [
    booked,
    interval('2026-11-09T08:45:00Z', '2026-11-09T09:15:00Z'),
    interval('2026-11-09T09:45:00Z', '2026-11-09T10:15:00Z'),
    interval('2026-11-09T08:00:00Z', '2026-11-09T11:00:00Z'),
    interval('2026-11-09T09:15:00Z', '2026-11-09T09:45:00Z'),
  ]) {
    assert.equal(intervalsOverlap(booked, candidate), true)
    assert.equal(intervalsOverlap(candidate, booked), true)
  }
})

test('allows appointments directly before or after another', () => {
  assert.equal(intervalsOverlap(booked, interval('2026-11-09T08:30:00Z', '2026-11-09T09:00:00Z')), false)
  assert.equal(intervalsOverlap(booked, interval('2026-11-09T10:00:00Z', '2026-11-09T10:30:00Z')), false)
})

test('detects conflict among existing intervals', () => {
  assert.equal(hasAppointmentConflict(interval('2026-11-09T09:30:00Z', '2026-11-09T10:30:00Z'), [booked]), true)
  assert.equal(hasAppointmentConflict(interval('2026-11-09T10:00:00Z', '2026-11-09T10:30:00Z'), [booked]), false)
})

test('rejects invalid, empty, and reversed intervals', () => {
  assert.throws(() => intervalsOverlap(booked, interval('invalid', '2026-11-09T11:00:00Z')), RangeError)
  assert.throws(() => intervalsOverlap(booked, interval('2026-11-09T10:00:00Z', '2026-11-09T10:00:00Z')), RangeError)
  assert.throws(() => intervalsOverlap(booked, interval('2026-11-09T11:00:00Z', '2026-11-09T10:00:00Z')), RangeError)
})
