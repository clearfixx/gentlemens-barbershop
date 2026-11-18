import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStaffBookingMutation, changeStaffBookingStatus } from './staff-booking-transitions.ts'
import { AdminBookingConflictError } from '../booking/admin-booking-operations.ts'

const admin = { userId: 9, role: 'admin' as const, locationIds: [] }
const manager = { userId: 11, role: 'location_admin' as const, locationIds: [2, 4] }

test('status transitions accept only staff and valid identifiers', () => {
  assert.deepEqual(parseStaffBookingMutation('42', 'confirmed', manager), {
    bookingId: 42, next: 'confirmed',
  })
  for (const status of ['pending', 'invalid', null, 2, {}]) {
    assert.throws(() => parseStaffBookingMutation('42', status, manager), RangeError)
  }
  for (const id of ['0', '-1', '1.0', 'abc', '9007199254740993']) {
    assert.throws(() => parseStaffBookingMutation(id, 'cancelled', admin), RangeError)
  }
  assert.throws(() => parseStaffBookingMutation('42', 'cancelled', {
    ...manager, locationIds: [],
  }), /forbidden/)
})

test('guarded SQL must return one exact updated booking', async () => {
  let executions = 0
  const payload = { db: { drizzle: { execute: async () => {
    executions++
    return { rows: [{ id: 42, status: 'confirmed' }] }
  } } } } as unknown as Parameters<typeof changeStaffBookingStatus>[0]
  assert.deepEqual(await changeStaffBookingStatus(payload, manager, '42', 'confirmed'), {
    id: 42, status: 'confirmed',
  })
  assert.equal(executions, 1)
})

test('no match, duplicate or incorrect result fails closed', async () => {
  for (const rows of [[], [{ id: 42, status: 'cancelled' }], [
    { id: 42, status: 'confirmed' }, { id: 42, status: 'confirmed' },
  ]]) {
    const fake = { db: { drizzle: { execute: async () => ({ rows }) } } } as unknown as
      Parameters<typeof changeStaffBookingStatus>[0]
    await assert.rejects(changeStaffBookingStatus(fake, manager, '42', 'confirmed'))
  }
  const empty = { db: { drizzle: { execute: async () => ({ rows: [] }) } } } as unknown as
    Parameters<typeof changeStaffBookingStatus>[0]
  await assert.rejects(changeStaffBookingStatus(empty, admin, '42', 'confirmed'),
    AdminBookingConflictError)
})
