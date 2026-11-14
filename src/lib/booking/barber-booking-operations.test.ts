import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import {
  authenticatedBarber, parseBarberStatusChange, changeOwnBarberBookingStatus,
  getOwnBarberBookings, BarberBookingConflictError, BarberAccessError,
} from './barber-booking-operations.ts'

const actor = { id: 7, role: 'barber' }
type SqlPayload = Pick<Payload, 'db'>
function sqlPayload(rows: unknown[], capture: () => void = () => {}): SqlPayload {
  return { db: { drizzle: { execute: async () => { capture(); return { rows } } } } } as unknown as SqlPayload
}

test('requires a verified barber role and a valid booking ID', () => {
  assert.equal(authenticatedBarber(actor), 7)
  for (const value of [null, { id: 7, role: 'customer' }, { id: 0, role: 'barber' }]) {
    assert.throws(() => authenticatedBarber(value), BarberAccessError)
  }
  for (const id of ['0', '-1', '01', 'x', '9007199254740992']) {
    assert.throws(() => parseBarberStatusChange(id, 'confirmed', actor), RangeError)
  }
  for (const status of ['cancelled', 'pending', 'completed ', null, 'admin']) {
    assert.throws(() => parseBarberStatusChange('42', status, actor), RangeError)
  }
})

test('maps each action to the only allowed preceding state', () => {
  assert.deepEqual(parseBarberStatusChange('42', 'confirmed', actor), {
    bookingId: 42, userId: 7, target: 'confirmed', from: 'pending',
  })
  assert.equal(parseBarberStatusChange('42', 'completed', actor).from, 'confirmed')
  assert.equal(parseBarberStatusChange('42', 'no_show', actor).from, 'confirmed')
})

test('atomically returns only an update affecting the requested booking', async () => {
  let calls = 0
  const result = await changeOwnBarberBookingStatus(
    sqlPayload([{ id: 42, status: 'confirmed' }], () => { calls++ }),
    '42', 'confirmed', actor,
  )
  assert.deepEqual(result, { id: 42, status: 'confirmed' })
  assert.equal(calls, 1)
})

test('rejects absent, foreign, completed, cancelled or raced appointments with same conflict', async () => {
  await assert.rejects(
    changeOwnBarberBookingStatus(sqlPayload([]), '42', 'confirmed', actor),
    BarberBookingConflictError,
  )
})

test('refuses invalid actors before database access and malformed results after it', async () => {
  let calls = 0
  const payload = sqlPayload([{ id: 42, status: 'confirmed' }], () => { calls++ })
  await assert.rejects(changeOwnBarberBookingStatus(payload, '42', 'confirmed', null), BarberAccessError)
  assert.equal(calls, 0)
  for (const rows of [
    [{ id: 8, status: 'confirmed' }],
    [{ id: 42, status: 'pending' }],
    [{ id: 42, status: 'confirmed' }, { id: 42, status: 'confirmed' }],
  ]) {
    await assert.rejects(changeOwnBarberBookingStatus(sqlPayload(rows), '42', 'confirmed', actor))
  }
})

const ownBooking = {
  id: 42, barber: 3, location: 2, services: [5],
  startsAt: '2037-01-02T09:00:00.000Z', endsAt: '2037-01-02T10:00:00.000Z',
  status: 'pending', customerName: 'Customer',
  customerPhone: 'secret phone', customerEmail: 'secret@example.invalid',
  idempotencyKey: 'secret',
}
type ReadPayload = Pick<Payload, 'find'>
function readPayload(bookingRows: unknown[], track: (args: Record<string, unknown>) => void = () => {}): ReadPayload {
  return { find: async (args: Record<string, unknown>) => {
    track(args)
    if (args.collection === 'barbers') return {
      docs: [{ id: 3, user: 7, isActive: true }], hasNextPage: false, totalPages: 1,
    }
    return { docs: bookingRows, hasNextPage: false, totalPages: bookingRows.length ? 1 : 0 }
  } } as unknown as ReadPayload
}

test('scopes the agenda to the verified barber and returns only approved fields', async () => {
  const queries: Record<string, unknown>[] = []
  const result = await getOwnBarberBookings(
    readPayload([ownBooking], args => { queries.push(args) }), actor, { date: '2037-01-02' },
  )
  assert.equal(queries.length, 2)
  assert.deepEqual(queries[0].where, { and: [
    { user: { equals: 7 } }, { isActive: { equals: true } },
  ] })
  assert.equal(queries[1].collection, 'bookings')
  assert.deepEqual((queries[1].where as { and: unknown[] }).and[0], { barber: { equals: 3 } })
  assert.deepEqual(result, {
    bookings: [{
      id: 42, locationId: 2, startsAt: ownBooking.startsAt,
      endsAt: ownBooking.endsAt, status: 'pending',
      customerName: 'Customer', serviceIds: [5],
    }],
    page: 1, totalPages: 1, hasNextPage: false,
  })
  assert.ok(!JSON.stringify(result).includes('secret'))
})

test('rejects unlinked accounts, foreign booking rows and invalid dates', async () => {
  const unlinked = { find: async () => ({ docs: [], hasNextPage: false }) } as unknown as ReadPayload
  await assert.rejects(getOwnBarberBookings(unlinked, actor, { date: '2037-01-02' }), BarberAccessError)
  await assert.rejects(
    getOwnBarberBookings(readPayload([{ ...ownBooking, barber: 4 }]), actor, { date: '2037-01-02' }),
    /ownership mismatch/,
  )
  let queried = 0
  const payload = readPayload([ownBooking], () => { queried++ })
  for (const options of [
    { date: '2037-02-30' }, { date: 'yesterday' }, { date: '2037-01-02', limit: 51 },
    { date: '2037-01-02', page: 0 },
  ]) {
    await assert.rejects(getOwnBarberBookings(payload, actor, options), RangeError)
  }
  assert.equal(queried, 0)
})
