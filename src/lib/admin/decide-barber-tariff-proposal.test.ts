import assert from 'node:assert/strict'
import test from 'node:test'
import { decideBarberTariffProposal } from './decide-barber-tariff-proposal.ts'
import { tariffRevision } from './prepare-barber-tariff-proposal.ts'

const barcode = {
  id: 17, location_id: 4, created_by_id: 11,
  kind: 'barber_price', status: 'pending',
  service_id: 7, barber_id: 5,
  old_value: 600, proposed_value: 750,
  barber_location_id: 4,
  barber_updated_at: new Date('2026-11-16T10:00:00.000Z'),
  service_updated_at: new Date('2026-11-16T10:00:00.000Z'),
  service_price: '500',
  service_duration: '45',
  offering_id: 'row-a',
  price_override: '600',
  duration_override: null,
}
const expectedRevision = tariffRevision({
  locationId: 4, barberId: 5, serviceId: 7, kind: 'barber_price',
  baseValue: 500, overrideValue: 600,
  barberUpdatedAt: barcode.barber_updated_at.toISOString(),
  serviceUpdatedAt: barcode.service_updated_at.toISOString(),
})

type Mock = Parameters<typeof decideBarberTariffProposal>[0]
function stub(row: Record<string, unknown>, actions: number[]): Mock {
  return {
    db: { drizzle: {
      transaction: async (callback: (tx: { execute: (query: unknown) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
        callback({
          execute: async (_query: unknown) => {
            actions.push(1)
            return actions.length === 1
              ? { rows: [row] }
              : { rows: [{ id: actions.length }] }
          },
        }),
    } },
  } as unknown as Mock
}

test('approved tariff changes perform locked read, offering write, barber revision and decision record', async () => {
  const actions: number[] = []
  const result = await decideBarberTariffProposal(stub({
    ...barcode, expected_revision: expectedRevision,
  }, actions), 17, { id: 99, role: 'admin' }, { status: 'approved' })
  assert.deepEqual(result, { id: 17, status: 'approved' })
  assert.equal(actions.length, 4)
})

test('rejecting a tariff does not mutate the offering', async () => {
  const actions: number[] = []
  const result = await decideBarberTariffProposal(stub({
    ...barcode, expected_revision: expectedRevision,
  }, actions), 17, { id: 99, role: 'admin' }, {
    status: 'rejected', reason: 'Incorrect price',
  })
  assert.deepEqual(result, { id: 17, status: 'rejected' })
  assert.equal(actions.length, 2)
})

test('stale proposals fail before any mutation', async () => {
  const actions: number[] = []
  await assert.rejects(decideBarberTariffProposal(stub({
    ...barcode, expected_revision: 'old-version',
  }, actions), 17, { id: 99, role: 'admin' }, { status: 'approved' }), /stale/)
  assert.equal(actions.length, 1)
})

test('cross-location and self-approval attempts fail closed', async () => {
  for (const candidate of [
    { row: { ...barcode, expected_revision: expectedRevision, barber_location_id: 3 }, adminId: 99 },
    { row: { ...barcode, expected_revision: expectedRevision }, adminId: 11 },
  ]) {
    const actions: number[] = []
    await assert.rejects(decideBarberTariffProposal(stub(candidate.row, actions), 17, {
      id: candidate.adminId, role: 'admin',
    }, { status: 'approved' }))
    assert.equal(actions.length, 1)
  }
})

test('only network administrator may decide', async () => {
  const actions: number[] = []
  await assert.rejects(decideBarberTariffProposal(stub({
    ...barcode, expected_revision: expectedRevision,
  }, actions), 17, { id: 11, role: 'location_admin' }, { status: 'approved' }), /forbidden/)
  assert.equal(actions.length, 0)
})
