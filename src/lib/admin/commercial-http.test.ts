import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertCommercialMutationOrigin,
  parseTariffSubmission,
  parseTariffDecision,
} from './commercial-http.ts'

const valid = {
  locationId: 2, barberId: 4, serviceId: 7,
  kind: 'barber_price', proposedValue: 700,
}

test('strict submission accepts only controlled input fields', () => {
  assert.deepEqual(parseTariffSubmission(valid), valid)
  assert.throws(() => parseTariffSubmission({ ...valid, oldValue: 1 }), /Unexpected/)
  assert.throws(() => parseTariffSubmission({ ...valid, createdBy: 1 }), /Unexpected/)
  assert.throws(() => parseTariffSubmission({ ...valid, status: 'approved' }), /Unexpected/)
  for (const value of [null, [], {}, { ...valid, barberId: '4' }, { ...valid, proposedValue: 9.5 }]) {
    assert.throws(() => parseTariffSubmission(value), RangeError)
  }
})

test('decision requires an allowed status and a reason on rejection', () => {
  assert.deepEqual(parseTariffDecision({ status: 'approved' }), { status: 'approved' })
  assert.deepEqual(parseTariffDecision({ status: 'rejected', reason: ' Not valid ' }), {
    status: 'rejected', reason: 'Not valid',
  })
  assert.throws(() => parseTariffDecision({ status: 'rejected' }), /reason/)
  assert.throws(() => parseTariffDecision({ status: 'approved', decidedBy: 9 }), /Unexpected/)
  assert.throws(() => parseTariffDecision({ status: 'pending' }), RangeError)
})

test('staff mutation enforces same-origin including absent Origin', () => {
  const build = (origin?: string) => new Request('https://barbershop.example/api/admin/commercial-requests', {
    method: 'POST', headers: origin ? { origin } : {},
  })
  assert.doesNotThrow(() => assertCommercialMutationOrigin(build('https://barbershop.example')))
  assert.throws(() => assertCommercialMutationOrigin(build('https://attacker.example')), /origin/)
  assert.throws(() => assertCommercialMutationOrigin(build()), /origin/)
})
