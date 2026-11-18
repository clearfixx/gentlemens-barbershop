import assert from 'node:assert/strict'
import test from 'node:test'
import { rejectProfessionalProposal } from './reject-professional-proposal.ts'

type Db = Parameters<typeof rejectProfessionalProposal>[0]
function fake(row: Record<string, unknown> | null, steps: number[], updateRows = 1): Db {
  return {
    db: { drizzle: {
      transaction: async (callback: (tx: { execute: (query: unknown) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
        callback({
          execute: async () => {
            steps.push(1)
            return steps.length === 1
              ? { rows: row ? [row] : [] }
              : { rows: updateRows ? [{ id: 14 }] : [] }
          },
        }),
    } },
  } as unknown as Db
}
const pending = {
  id: 14, author_id: 8, status: 'pending', location_id: 5,
  current_barber_location_id: 5,
}

test('rejection updates only a pending proposal in one transaction', async () => {
  const steps: number[] = []
  const outcome = await rejectProfessionalProposal(fake(pending, steps), 14,
    { id: 2, role: 'admin' }, '  Missing evidence  ')
  assert.deepEqual(outcome, { id: 14, status: 'rejected' })
  assert.equal(steps.length, 2)
})

test('manager and self-approval are forbidden', async () => {
  const steps: number[] = []
  await assert.rejects(rejectProfessionalProposal(fake(pending, steps), 14,
    { id: 2, role: 'location_admin' }, 'Missing consent'), /forbidden/)
  assert.equal(steps.length, 0)
  await assert.rejects(rejectProfessionalProposal(fake(pending, steps), 14,
    { id: 8, role: 'admin' }, 'Missing consent'), /self-approval/)
  assert.equal(steps.length, 1)
})

test('replay, unsubmitted draft, relocation and conflicting write fail closed', async () => {
  for (const row of [
    { ...pending, status: 'rejected' },
    { ...pending, status: 'draft' },
    { ...pending, current_barber_location_id: 9 },
  ]) {
    const steps: number[] = []
    await assert.rejects(rejectProfessionalProposal(fake(row, steps), 14,
      { id: 2, role: 'admin' }, 'Missing consent'))
    assert.equal(steps.length, 1)
  }
  await assert.rejects(rejectProfessionalProposal(fake(pending, [], 0), 14,
    { id: 2, role: 'admin' }, 'Missing consent'), /conflict/)
})

test('malformed input is rejected before querying the database', async () => {
  const steps: number[] = []
  for (const reason of ['', '  ', 'x'.repeat(1001)]) {
    await assert.rejects(rejectProfessionalProposal(fake(pending, steps), 14,
      { id: 2, role: 'admin' }, reason), RangeError)
  }
  await assert.rejects(rejectProfessionalProposal(fake(pending, steps), 0,
    { id: 2, role: 'admin' }, 'Missing consent'), /forbidden/)
  assert.equal(steps.length, 0)
})
