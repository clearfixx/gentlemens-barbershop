import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parsePrecautionaryHold, placePrecautionaryPortfolioHold, PortfolioHoldConflict,
} from './portfolio-precautionary-holds.ts'

const input = { kind: 'consent_concern' as const,
  caseReference: 'case:2026-0001', reason: 'Customer consent may have been withdrawn' }
type Repo = Parameters<typeof placePrecautionaryPortfolioHold>[0]
function mock(steps: number[], options: {
  revision?: boolean; media?: boolean; admin?: boolean; duplicate?: boolean; candidates?: number
} = {}): Repo {
  const tx = { execute: async (): Promise<{ rows: unknown[] }> => {
    steps.push(1)
    const rows: unknown[][] = [
      options.revision === false ? [] : [{ id: 18 }],
      options.media === false ? [] : [{ id: 9 }],
      options.admin === false ? [] : [{ id: 2 }],
      options.duplicate ? [] : [{ id: 5 }],
      Array.from({ length: options.candidates ?? 1 }, (_, i) => ({ id: 12 + i })),
      [{ id: 100 }],
    ]
    return { rows: rows[Math.min(steps.length - 1, rows.length - 1)] }
  } }
  return { db: { drizzle: { transaction: async (callback: (t: typeof tx) => Promise<unknown>) =>
    callback(tx) } } } as unknown as Repo
}

test('requires opaque case identifier, explanation and only supported concern types', () => {
  assert.deepEqual(parsePrecautionaryHold(input), input)
  for (const value of [
    { ...input, caseReference: 'https://private' },
    { ...input, caseReference: '../danger' },
    { ...input, reason: 'a' },
    { ...input, kind: 'verified_consent_withdrawal' },
    { ...input, customerName: 'PII' },
  ]) assert.throws(() => parsePrecautionaryHold(value), RangeError)
})

test('one precautionary hold also withdraws candidate with audit in transaction', async () => {
  const steps: number[] = []
  const result = await placePrecautionaryPortfolioHold(mock(steps),
    { id: 2, role: 'admin' }, 18, 9, input)
  assert.deepEqual(result, { holdId: 5, revisionId: 18, mediaId: 9, withdrawnCandidates: 1 })
  assert.equal(steps.length, 6)
})

test('hold before candidate exists still seals media for subsequent prepare', async () => {
  const steps: number[] = []
  const result = await placePrecautionaryPortfolioHold(mock(steps, { candidates: 0 }),
    { id: 2, role: 'admin' }, 18, 9, input)
  assert.equal(result.withdrawnCandidates, 0)
  assert.equal(steps.length, 5)
})

test('other locations, revoked role and repeat holds fail closed', async () => {
  for (const [options, expectedSteps] of [
    [{ revision: false }, 1],
    [{ media: false }, 2],
    [{ admin: false }, 3],
    [{ duplicate: true }, 4],
  ] as const) {
    const steps: number[] = []
    await assert.rejects(placePrecautionaryPortfolioHold(mock(steps, options),
      { id: 2, role: 'admin' }, 18, 9, input), PortfolioHoldConflict)
    assert.equal(steps.length, expectedSteps)
  }
  await assert.rejects(placePrecautionaryPortfolioHold(mock([]),
    { id: 2, role: 'location_admin' }, 18, 9, input), PortfolioHoldConflict)
})
