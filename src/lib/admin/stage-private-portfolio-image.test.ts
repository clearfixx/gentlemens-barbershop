import assert from 'node:assert/strict'
import test from 'node:test'
import { stagePrivatePortfolioImage, PrivatePortfolioUploadForbidden } from './stage-private-portfolio-image.ts'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAF3RFWHRjb21tZW50AHNlY3JldC1tZXRhZGF0YdHOKngAAAANSURBVHicY/jPwPAfAAUAAf+JmT0dAAAAAElFTkSuQmCC',
  'base64',
)
const draft = {
  id: 10, author_id: 7, barber_id: 15, location_id: 5, status: 'draft',
  barber_user_id: 7, barber_location_id: 5,
  changes: { portfolio: { items: [] } },
}
type Repo = Parameters<typeof stagePrivatePortfolioImage>[0]
function stub(row: Record<string, unknown> | null, calls: number[], existing = 0): Repo {
  return { db: { drizzle: {
    transaction: async (fn: (tx: { execute: () => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      fn({ execute: async () => {
        calls.push(1)
        if (calls.length === 1) return { rows: row ? [row] : [] }
        if (calls.length === 2) return { rows: [{ total: existing }] }
        return { rows: [{ id: 44 }] }
      } }),
  } } } as unknown as Repo
}
const barber = { id: 7, role: 'barber' }

test('only verified draft owner may stage a sanitized private PNG', async () => {
  const calls: number[] = []
  const result = await stagePrivatePortfolioImage(stub(draft, calls), barber, 10, png)
  assert.deepEqual(result, { id: 44, revisionId: 10, mimeType: 'image/png',
    sizeBytes: result.sizeBytes })
  assert.ok(result.sizeBytes < png.byteLength)
  assert.equal(calls.length, 3)
})

test('other staff and revoked barber bindings cannot insert private bytes', async () => {
  const calls: number[] = []
  await assert.rejects(stagePrivatePortfolioImage(stub(draft, calls),
    { id: 7, role: 'admin' }, 10, png), PrivatePortfolioUploadForbidden)
  assert.equal(calls.length, 0)
  for (const row of [
    null, { ...draft, status: 'pending' }, { ...draft, status: 'approved' },
    { ...draft, barber_user_id: 9 }, { ...draft, barber_location_id: 88 },
    { ...draft, changes: { bio: 'Not a portfolio' } },
  ]) {
    const checks: number[] = []
    await assert.rejects(stagePrivatePortfolioImage(stub(row, checks), barber, 10, png),
      PrivatePortfolioUploadForbidden)
    assert.equal(checks.length, 1)
  }
})

test('technical item cap blocks staged uploads before insert', async () => {
  const calls: number[] = []
  await assert.rejects(stagePrivatePortfolioImage(stub(draft, calls, 30), barber, 10, png),
    /limit/)
  assert.equal(calls.length, 2)
})
