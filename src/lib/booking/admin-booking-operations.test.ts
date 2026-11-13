import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import {
  AdminBookingAccessError, AdminBookingConflictError,
  parseAdminBookingChange, getAdminBookings, changeAdminBookingStatus,
} from './admin-booking-operations.ts'

const admin = { id: 9, role: 'admin' }
const booking = {
  id: 42, location: 2, barber: 3, customer: 7, customerName: 'Customer',
  customerPhone: '+380671234567', customerEmail: 'customer@example.invalid',
  services: [5], startsAt: '2037-01-02T09:00:00.000Z',
  endsAt: '2037-01-02T10:00:00.000Z', totalPrice: 650,
  status: 'pending', notes: 'Private admin note', idempotencyKey: 'secret',
}

function readPayload(rows: unknown[], capture: (args: Record<string, unknown>) => void = () => {}): Pick<Payload, 'find'> {
  return { find: async (args: Record<string, unknown>) => {
    capture(args)
    return { docs: rows, totalPages: rows.length > 0 ? 1 : 0, hasNextPage: false }
  } } as unknown as Pick<Payload, 'find'>
}

test('admin list requires a valid admin principal before accessing database', async () => {
  let queries = 0
  const payload = readPayload([], () => { queries++ })
  for (const actor of [null, { id: 3, role: 'customer' }, { id: 7, role: 'barber' }, { id: 0, role: 'admin' }]) {
    await assert.rejects(getAdminBookings(payload, actor), AdminBookingAccessError)
  }
  assert.equal(queries, 0)
})

test('admin list is bounded and filtered; only allowlisted columns are returned', async () => {
  const queries: Record<string, unknown>[] = []
  const result = await getAdminBookings(readPayload([booking], args => { queries.push(args) }), admin, {
    page: 2, limit: 5, locationId: 2, barberId: 3, status: 'pending', date: '2037-01-02',
  })
  assert.deepEqual(result, {
    bookings: [{
      id: 42, locationId: 2, barberId: 3, customerId: 7,
      customerName: 'Customer', customerPhone: '+380671234567',
      customerEmail: 'customer@example.invalid', serviceIds: [5],
      startsAt: booking.startsAt, endsAt: booking.endsAt,
      totalPrice: 650, status: 'pending',
    }],
    page: 2, totalPages: 1, hasNextPage: false,
  })
  assert.equal(queries[0].collection, 'bookings')
  assert.equal(queries[0].overrideAccess, true)
  assert.equal(queries[0].depth, 0)
  assert.deepEqual(queries[0].sort, ['-startsAt', '-id'])
  assert.deepEqual(queries[0].where, { and: [
    { location: { equals: 2 } }, { barber: { equals: 3 } },
    { status: { equals: 'pending' } },
    { startsAt: { less_than: '2037-01-03T00:00:00.000Z' } },
    { endsAt: { greater_than: '2037-01-02T00:00:00.000Z' } },
  ] })
  assert.ok(!JSON.stringify(result).includes('secret'))
})

test('admin inventory rejects malformed inputs and malformed records', async () => {
  let calls = 0
  const payload = readPayload([], () => { calls++ })
  for (const options of [
    { page: 0 }, { limit: 51 }, { barberId: -1 }, { locationId: 1.5 },
    { date: '2037-02-30' }, { status: 'invalid' as never },
  ]) {
    await assert.rejects(getAdminBookings(payload, admin, options), RangeError)
  }
  assert.equal(calls, 0)
  for (const bad of [
    { ...booking, customerPhone: null },
    { ...booking, services: [] },
    { ...booking, status: 'unrecognized' },
    { ...booking, id: '1; SELECT * FROM users' },
  ]) {
    await assert.rejects(getAdminBookings(readPayload([bad]), admin))
  }
})

test('status transition preconditions are strict and admin-only', () => {
  assert.deepEqual(parseAdminBookingChange('42', 'confirmed', admin), {
    id: 42, adminId: 9, next: 'confirmed', previous: ['pending'],
  })
  assert.deepEqual(parseAdminBookingChange('42', 'cancelled', admin).previous, ['pending', 'confirmed'])
  assert.deepEqual(parseAdminBookingChange('42', 'completed', admin).previous, ['confirmed'])
  assert.deepEqual(parseAdminBookingChange('42', 'no_show', admin).previous, ['confirmed'])
  for (const status of ['pending', 'invalid', null, {}, 12]) {
    assert.throws(() => parseAdminBookingChange('42', status, admin), RangeError)
  }
  assert.throws(() => parseAdminBookingChange('42', 'confirmed', { id: 2, role: 'customer' }), AdminBookingAccessError)
  assert.throws(() => parseAdminBookingChange('invalid', 'confirmed', admin), RangeError)
})

function writePayload(rows: unknown[], capture: () => void = () => {}): Pick<Payload, 'db'> {
  return { db: { drizzle: { execute: async () => { capture(); return { rows } } } } } as unknown as Pick<Payload, 'db'>
}

test('admin mutation returns only exactly matching atomic DB changes', async () => {
  let executions = 0
  const valid = await changeAdminBookingStatus(
    writePayload([{ id: 42, status: 'cancelled' }], () => { executions++ }),
    '42', 'cancelled', admin,
  )
  assert.deepEqual(valid, { id: 42, status: 'cancelled' })
  assert.equal(executions, 1)
  await assert.rejects(changeAdminBookingStatus(writePayload([]), '42', 'confirmed', admin),
    AdminBookingConflictError)
  await assert.rejects(changeAdminBookingStatus(writePayload([{ id: 43, status: 'confirmed' }]), '42', 'confirmed', admin))
  await assert.rejects(changeAdminBookingStatus(writePayload([{ id: 42, status: 'completed' }]), '42', 'confirmed', admin))
})

test('admin mutation refuses non-admin before executing SQL', async () => {
  let called = false
  const payload = writePayload([], () => { called = true })
  await assert.rejects(changeAdminBookingStatus(payload, '42', 'cancelled', null), AdminBookingAccessError)
  assert.equal(called, false)
})
