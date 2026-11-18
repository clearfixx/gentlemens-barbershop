import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validatePortfolioSubmission, submitPrivatePortfolioDraft, PortfolioSubmissionConflict,
} from './submit-private-portfolio-draft.ts'

const item = {
  mediaId: 21, alt: 'Textured haircut', caption: 'Side view',
  sortOrder: 1, rightsDeclared: true, clientConsentDeclared: true,
}
const pending = {
  id: 5, author_id: 7, barber_id: 9, location_id: 3,
  barber_user_id: 7, barber_location_id: 3, status: 'draft',
  changes: { portfolio: { items: [] } }, snapshot: { portfolio: { items: [] } },
}
type Repo = Parameters<typeof submitPrivatePortfolioDraft>[0]
function fake(row: Record<string, unknown> | null, media: Record<string, unknown>[], steps: number[]): Repo {
  return { db: { drizzle: {
    transaction: async (callback: (tx: { execute: () => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      callback({ execute: async () => {
        steps.push(1)
        if (steps.length === 1) return { rows: row ? [row] : [] }
        if (steps.length === 2) return { rows: media }
        return { rows: [{ id: 5 }] }
      } }),
  } } } as unknown as Repo
}
const photos = [{ id: 21, mime_type: 'image/png', size_bytes: 700,
  sha256: 'a'.repeat(64) }]
const actor = { id: 7, role: 'barber' }

test('canonical submission requires exact photo fields, consent flags and unique sort positions', () => {
  const order = validatePortfolioSubmission({ items: [{ ...item, sortOrder: 3 },
    { ...item, mediaId: 22, sortOrder: 1 }] })
  assert.deepEqual(order.map(x => x.mediaId), [22, 21])
  for (const value of [
    { items: [] },
    { items: [{ ...item, clientConsentDeclared: false }] },
    { items: [{ ...item, rightsDeclared: false }] },
    { items: [{ ...item, url: 'https://unsafe.test' }] },
    { items: [item, { ...item, mediaId: 22 }] },
    { items: [{ ...item, mediaId: 0 }] },
  ]) assert.throws(() => validatePortfolioSubmission(value), RangeError)
})

test('submission pins a complete staged set and returns its canonical fingerprint', async () => {
  const steps: number[] = []
  const result = await submitPrivatePortfolioDraft(fake(pending, photos, steps),
    actor, 5, { items: [item] })
  assert.deepEqual({ id: result.id, status: result.status, mediaCount: result.mediaCount },
    { id: 5, status: 'pending', mediaCount: 1 })
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/)
  assert.equal(steps.length, 3)
})

test('foreign media ID, missing file or extra unlisted image blocks submission', async () => {
  for (const media of [[], [{ ...photos[0], id: 23 }],
    [...photos, { ...photos[0], id: 22 }]]) {
    const steps: number[] = []
    await assert.rejects(submitPrivatePortfolioDraft(fake(pending, media, steps), actor,
      5, { items: [item] }), PortfolioSubmissionConflict)
    assert.equal(steps.length, 2)
  }
})

test('not the draft author, changed barber binding, or status transition blocks write', async () => {
  const steps: number[] = []
  await assert.rejects(submitPrivatePortfolioDraft(fake(pending, photos, steps),
    { id: 8, role: 'admin' }, 5, { items: [item] }), PortfolioSubmissionConflict)
  assert.equal(steps.length, 0)
  for (const row of [
    null, { ...pending, status: 'pending' },
    { ...pending, barber_user_id: 10 },
    { ...pending, barber_location_id: 99 },
    { ...pending, changes: { bio: 'unrelated' } },
  ]) {
    const calls: number[] = []
    await assert.rejects(submitPrivatePortfolioDraft(fake(row, photos, calls),
      actor, 5, { items: [item] }), PortfolioSubmissionConflict)
    assert.equal(calls.length, 1)
  }
})
