import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertCanSubmitCommercialChange,
  decideCommercialChange,
  type CommercialActor,
  type CommercialChange,
} from './commercial-approval-policy.ts'

const manager: CommercialActor = { userId: 11, role: 'location_admin', locationIds: [2, 4] }
const admin: CommercialActor = { userId: 99, role: 'admin', locationIds: [] }
const change: CommercialChange = {
  id: 8, locationId: 2, kind: 'barber_price', status: 'pending',
  createdBy: 11, expectedRevision: 'revision-7', oldValue: 600, proposedValue: 750,
}

test('location administrator can submit only within assigned locations', () => {
  assert.doesNotThrow(() => assertCanSubmitCommercialChange(manager, change))
  assert.throws(() => assertCanSubmitCommercialChange(manager, { ...change, locationId: 3 }), /forbidden/)
  assert.throws(() => assertCanSubmitCommercialChange({ ...manager, role: 'barber' }, change), /forbidden/)
  assert.doesNotThrow(() => assertCanSubmitCommercialChange(admin, change))
})

test('rejects invalid commercial values, noop edits and revisions', () => {
  for (const proposed of [
    { ...change, proposedValue: -1 },
    { ...change, proposedValue: 600 },
    { ...change, proposedValue: 701.5 },
    { ...change, expectedRevision: '' },
    { ...change, kind: 'service_duration' as const, proposedValue: 0 },
    { ...change, kind: 'barber_duration' as const, proposedValue: 481 },
    { ...change, kind: 'service_assignment' as const, proposedValue: 1 },
  ]) {
    assert.throws(() => assertCanSubmitCommercialChange(manager, proposed), /Invalid commercial/)
  }
  assert.doesNotThrow(() => assertCanSubmitCommercialChange(manager, {
    ...change, kind: 'service_price', oldValue: 100, proposedValue: 0,
  }))
  assert.doesNotThrow(() => assertCanSubmitCommercialChange(manager, {
    ...change, kind: 'service_assignment', oldValue: false, proposedValue: true,
  }))
})

test('only a separate network administrator may approve', () => {
  assert.throws(() => decideCommercialChange(manager, change, { status: 'approved' }, 'revision-7'), /restricted/)
  assert.throws(() => decideCommercialChange({ ...admin, userId: 11 }, change, { status: 'approved' }, 'revision-7'), /Self approval/)
  assert.deepEqual(decideCommercialChange(admin, change, { status: 'approved' }, 'revision-7'), {
    status: 'approved', decidedBy: 99, reason: null,
  })
})

test('rejects stale approvals and terminal-state replays', () => {
  assert.throws(() => decideCommercialChange(admin, change, { status: 'approved' }, 'revision-8'), /stale/)
  assert.throws(() => decideCommercialChange(admin, { ...change, status: 'rejected' }, { status: 'approved' }, 'revision-7'), /no longer pending/)
})

test('rejections require reason and keep the approval status separate', () => {
  assert.throws(() => decideCommercialChange(admin, change, { status: 'rejected' }, 'revision-8'), /reason is required/)
  assert.deepEqual(decideCommercialChange(admin, change, { status: 'rejected', reason: ' Pricing policy ' }, 'revision-8'), {
    status: 'rejected', decidedBy: 99, reason: 'Pricing policy',
  })
})
