import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHoldCaseEvent, recordPortfolioHoldCaseEvent, HoldCaseConflict } from './portfolio-hold-cases.ts'

const decision = { stage: 'investigating' as const, assignedAdminId: 2,
  note: 'Investigate case reference with administrator' }
type Repo = Parameters<typeof recordPortfolioHoldCaseEvent>[0]
function fake(steps: number[], options: {
  hold?: boolean; previous?: string; users?: number[]
} = {}): Repo {
  const tx = { execute: async (): Promise<{ rows: unknown[] }> => {
    steps.push(1)
    const rows: unknown[][] = [
      options.hold === false ? [] : [{ id: 8 }],
      options.previous ? [{ stage: options.previous }] : [],
      (options.users ?? [2]).map(id => ({ id })),
      [{ id: 29 }],
    ]
    return { rows: rows[steps.length - 1] ?? [] }
  } }
  return { db: { drizzle: {
    transaction: async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
  } } } as unknown as Repo
}

test('strict stage and assignment contract with no claimant PII fields', () => {
  assert.deepEqual(parseHoldCaseEvent(decision), decision)
  for (const bad of [
    { ...decision, stage: 'verified_withdrawal' },
    { ...decision, assignedAdminId: 0 },
    { ...decision, assignedAdminId: 2.5 },
    { ...decision, note: 'tiny' },
    { ...decision, claimantEmail: 'private@example.test' },
  ]) assert.throws(() => parseHoldCaseEvent(bad), RangeError)
})

test('appends stage event for an assigned active network administrator', async () => {
  const count: number[] = []
  const result = await recordPortfolioHoldCaseEvent(fake(count), {
    id: 2, role: 'admin',
  }, 8, decision)
  assert.deepEqual(result, { id: 29, holdId: 8,
    stage: 'investigating', assignedAdminId: 2 })
  assert.equal(count.length, 4)
  assert.doesNotMatch(JSON.stringify(result), /note|claimant|email/)
})

test('case cannot close without triage, but may close after investigation', async () => {
  const close = { ...decision, stage: 'closed_administratively' }
  await assert.rejects(recordPortfolioHoldCaseEvent(fake([]), {
    id: 2, role: 'admin',
  }, 8, close), HoldCaseConflict)
  const result = await recordPortfolioHoldCaseEvent(fake([], { previous: 'investigating' }), {
    id: 2, role: 'admin',
  }, 8, close)
  assert.equal(result.stage, 'closed_administratively')
  await assert.rejects(recordPortfolioHoldCaseEvent(
    fake([], { previous: 'closed_administratively' }), {
      id: 2, role: 'admin',
    }, 8, decision), HoldCaseConflict)
})

test('revoked admin, invalid assignee, unauthorized role and nonexistent hold fail closed', async () => {
  for (const opts of [
    { hold: false }, { users: [] }, { users: [2] },
  ]) {
    const call: number[] = []
    await assert.rejects(recordPortfolioHoldCaseEvent(fake(call, opts), {
      id: 2, role: 'admin',
    }, 8, { ...decision, assignedAdminId: 9 }), HoldCaseConflict)
  }
  await assert.rejects(recordPortfolioHoldCaseEvent(fake([]), {
    id: 2, role: 'location_admin',
  }, 8, decision), HoldCaseConflict)
})
