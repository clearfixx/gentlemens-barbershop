import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareBarberTariffProposal, submitBarberTariffProposal, tariffRevision } from './prepare-barber-tariff-proposal.ts'

type Mock = Parameters<typeof prepareBarberTariffProposal>[0]
function catalog({
  branch = 4,
  offering = { service: 7, priceOverride: 600, durationOverrideMinutes: null },
}: { branch?: number; offering?: { service: number; priceOverride: number | null; durationOverrideMinutes: number | null } } = {}): Mock {
  return {
    find: async () => ({
      docs: [{ user: 11, location: 4 }],
      hasNextPage: false,
    }),
    findByID: async ({ collection }: { collection: string }) => collection === 'barbers'
      ? { id: 5, location: branch, updatedAt: '2026-11-16T10:00:00.000Z', serviceOfferings: [offering] }
      : { id: 7, price: 500, durationMinutes: 45, updatedAt: '2026-11-16T10:00:00.000Z' },
  } as unknown as Mock
}

const request = { locationId: 4, barberId: 5, serviceId: 7, kind: 'barber_price' as const, proposedValue: 750 }

test('proposals derive existing barber prices from trusted catalog', async () => {
  const value = await prepareBarberTariffProposal(catalog(), { id: 11, role: 'location_admin' }, request)
  assert.equal(value.oldValue, 600)
  assert.equal(value.proposedValue, 750)
  assert.equal(value.createdBy, 11)
  assert.equal(value.location, 4)
  assert.equal(value.status, 'pending')
  assert.match(value.expectedRevision, /^[0-9a-f]{64}$/)
})

test('fallback price and duration are used only when no barber override exists', async () => {
  const value = await prepareBarberTariffProposal(
    catalog({ offering: { service: 7, priceOverride: null, durationOverrideMinutes: null } }),
    { id: 11, role: 'location_admin' }, request,
  )
  assert.equal(value.oldValue, 500)
  const duration = await prepareBarberTariffProposal(catalog(), { id: 11, role: 'location_admin' }, {
    ...request, kind: 'barber_duration', proposedValue: 60,
  })
  assert.equal(duration.oldValue, 45)
})

test('managers may not propose changes for another branch or account', async () => {
  await assert.rejects(
    prepareBarberTariffProposal(catalog({ branch: 3 }), { id: 11, role: 'location_admin' }, request),
    /does not belong/,
  )
  await assert.rejects(
    prepareBarberTariffProposal(catalog(), { id: 12, role: 'location_admin' }, request),
    /ownership mismatch/,
  )
  await assert.rejects(
    prepareBarberTariffProposal(catalog(), { id: 11, role: 'customer' }, request),
    /forbidden/,
  )
})

test('revisions change when approved overrides or catalog versions change', () => {
  const baseline = {
    locationId: 4, barberId: 5, serviceId: 7, kind: 'barber_price' as const,
    baseValue: 500, overrideValue: 600, barberUpdatedAt: 'a', serviceUpdatedAt: 'b',
  }
  assert.equal(tariffRevision(baseline), tariffRevision({ ...baseline }))
  assert.notEqual(tariffRevision(baseline), tariffRevision({ ...baseline, overrideValue: 650 }))
  assert.notEqual(tariffRevision(baseline), tariffRevision({ ...baseline, barberUpdatedAt: 'c' }))
})

test('rejects ineffective edits and out-of-range tariffs', async () => {
  for (const proposedValue of [600, -1, 4.5]) {
    await assert.rejects(prepareBarberTariffProposal(catalog(), {
      id: 11, role: 'location_admin',
    }, { ...request, proposedValue }), /Invalid/)
  }
})

test('submission saves a pending immutable snapshot without mutating a live tariff', async () => {
  const writes: Array<{ collection: string; overrideAccess: boolean; data: Record<string, unknown> }> = []
  const base = catalog()
  const payload = {
    ...base,
    create: async (args: { collection: string; overrideAccess: boolean; data: Record<string, unknown> }) => {
      writes.push(args)
      return { id: 123, ...args.data }
    },
  } as unknown as Parameters<typeof submitBarberTariffProposal>[0]
  const result = await submitBarberTariffProposal(payload, { id: 11, role: 'location_admin' }, request)
  assert.equal(result.id, 123)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].collection, 'commercial-change-requests')
  assert.equal(writes[0].overrideAccess, true)
  assert.equal(writes[0].data.status, 'pending')
  assert.equal(writes[0].data.createdBy, 11)
  assert.equal(writes[0].data.oldValue, 600)
  assert.equal(writes[0].data.proposedValue, 750)
})
