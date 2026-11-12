import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectLoyalty, type LoyaltyEntry } from './ledger.ts'

const earned: LoyaltyEntry = {
  id: 'earned', customerId: 'customer-1', idempotencyKey: 'booking-1',
  event: { kind: 'earn', xp: 120, bonus: 25, source: 'completed-booking' },
}
const spent: LoyaltyEntry = {
  id: 'spent', customerId: 'customer-1', idempotencyKey: 'order-1',
  event: { kind: 'redeem', bonus: 10, source: 'order' },
}
const reverse = (id: string, originalEventId: string): LoyaltyEntry => ({
  id, customerId: 'customer-1', idempotencyKey: id,
  event: { kind: 'reverse', originalEventId, source: 'refund' },
})

test('XP is not spendable and bonuses decrease on redemption', () => {
  assert.deepEqual(projectLoyalty([earned, spent]), { xp: 120, bonus: 15 })
})
test('reversing redemption restores only bonuses', () => {
  assert.deepEqual(projectLoyalty([earned, spent, reverse('r', 'spent')]), { xp: 120, bonus: 25 })
})
test('reversing earnings removes XP and bonuses', () => {
  assert.deepEqual(projectLoyalty([earned, reverse('r', 'earned')]), { xp: 0, bonus: 0 })
})
test('cannot reverse rewards that have already been spent', () => {
  assert.throws(() => projectLoyalty([earned, spent, reverse('r', 'earned')]), /already spent/)
})
test('cannot overspend or redeem negative points', () => {
  assert.throws(() => projectLoyalty([spent]), /Insufficient/)
  assert.throws(() => projectLoyalty([{ ...spent, event: { kind: 'redeem', bonus: -1, source: 'order' } }]), /non-negative/)
})
test('idempotency keys, event IDs and reversal targets are unique', () => {
  assert.throws(() => projectLoyalty([earned, earned]), /Duplicate/)
  assert.throws(() => projectLoyalty([earned, { ...spent, idempotencyKey: earned.idempotencyKey }]), /Duplicate/)
  assert.throws(() => projectLoyalty([earned, reverse('r1', 'earned'), reverse('r2', 'earned')]), /unreversed/)
})
test('cannot combine customers, reverse future entries or overflow', () => {
  assert.throws(() => projectLoyalty([earned, { ...spent, customerId: 'customer-2' }]), /different customers/)
  assert.throws(() => projectLoyalty([reverse('r', 'earned'), earned]), /prior/)
  assert.throws(() => projectLoyalty([{ ...earned, event: { kind: 'earn', xp: Number.MAX_SAFE_INTEGER + 1, bonus: 0, source: 'booking' } }]), /safe integer/)
})
