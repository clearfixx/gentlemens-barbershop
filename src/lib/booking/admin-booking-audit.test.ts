import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Payload } from 'payload'
import { getAdminBookingAudit, AdminBookingAuditAccessError } from './admin-booking-audit.ts'

const admin = { id: 9, role: 'admin' }
const example = {
  id: 7, booking: 42, action: 'cancelled', previousStatus: 'confirmed',
  actor: 9, actorRole: 'admin', reason: null, createdAt: '2037-01-02T12:00:00.000Z',
  unrelatedSecret: 'never expose',
}

function payloadFor(
  docs: unknown[],
  observe: (args: Record<string, unknown>) => void = () => {},
): Pick<Payload, 'find'> {
  return { find: async (args: Record<string, unknown>) => {
    observe(args)
    return { docs, totalPages: docs.length ? 1 : 0, hasNextPage: false }
  } } as unknown as Pick<Payload, 'find'>
}

test('only an authenticated admin can query events', async () => {
  let calls = 0
  const payload = payloadFor([example], () => { calls++ })
  for (const actor of [null, { id: 0, role: 'admin' }, { id: 2, role: 'customer' },
    { id: 4, role: 'barber' }]) {
    await assert.rejects(getAdminBookingAudit(payload, actor, '42'), AdminBookingAuditAccessError)
  }
  assert.equal(calls, 0)
})

test('event history filters by booking and returns only explicit fields', async () => {
  const calls: Record<string, unknown>[] = []
  const result = await getAdminBookingAudit(payloadFor([example], args => { calls.push(args) }), admin, '42')
  assert.deepEqual(calls[0].where, { booking: { equals: 42 } })
  assert.equal(calls[0].collection, 'booking-events')
  assert.equal(calls[0].overrideAccess, true)
  assert.equal(calls[0].depth, 0)
  assert.deepEqual(calls[0].sort, ['createdAt', 'id'])
  assert.deepEqual(result, {
    events: [{
      id: 7, bookingId: 42, action: 'cancelled', previousStatus: 'confirmed',
      actorId: 9, actorRole: 'admin', reason: null,
      createdAt: '2037-01-02T12:00:00.000Z',
    }],
    page: 1, totalPages: 1, hasNextPage: false,
  })
  assert.ok(!JSON.stringify(result).includes('never expose'))
})

test('invalid pagination and booking IDs are rejected before querying', async () => {
  let calls = 0
  const payload = payloadFor([], () => { calls++ })
  for (const id of ['0', '01', '-2', '1 OR TRUE', '9007199254740992']) {
    await assert.rejects(getAdminBookingAudit(payload, admin, id), RangeError)
  }
  for (const options of [{ page: 0 }, { page: 1001 }, { limit: 51 }, { limit: -1 }]) {
    await assert.rejects(getAdminBookingAudit(payload, admin, '42', options), RangeError)
  }
  assert.equal(calls, 0)
})

test('foreign or corrupted events fail closed', async () => {
  const invalid = [
    { ...example, booking: 99 },
    { ...example, actor: null },
    { ...example, actorRole: 'customer_impersonator' },
    { ...example, previousStatus: 'invalid' },
    { ...example, action: 'pending' },
    { ...example, createdAt: 'not a date' },
    { ...example, reason: { private: true } },
  ]
  for (const item of invalid) {
    await assert.rejects(getAdminBookingAudit(payloadFor([item]), admin, '42'))
  }
  await assert.rejects(
    getAdminBookingAudit(payloadFor([example, example]), admin, '42', { limit: 1 }),
    /Invalid booking audit pagination response/,
  )
})
