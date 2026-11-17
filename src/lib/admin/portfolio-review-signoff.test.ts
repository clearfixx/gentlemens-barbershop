import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import { parsePortfolioSignoff, PortfolioSignoffConflict, signoffPortfolioReview } from './portfolio-review-signoff.ts'

const content = Buffer.from('sample image bytes')
const sha = createHash('sha256').update(content).digest('hex')
const item = { mediaId: 9, alt: 'Portrait haircut', sortOrder: 0,
  rightsDeclared: true, clientConsentDeclared: true }
const record = { id: 11, status: 'pending', author_id: 5,
  current_owner_id: 5, location_id: 2, current_location_id: 2, barber_id: 7,
  changes: { portfolio: { items: [item] } },
  submitted_manifest_hash: computeSubmittedPortfolioManifest(
    { barberId: 7, locationId: 2, authorId: 5 },
    [item], [{ id: 9, mime: 'image/png', size: content.length, sha }],
  ),
}
const image = { id: 9, barber_id: 7, location_id: 2, uploaded_by_id: 5,
  mime_type: 'image/png', size_bytes: content.length, sha256: sha, content }
const reviewed = { media_id: 9, outcome: 'evidence_reviewed',
  rights_reference: 'rights:doc-1', consent_reference: 'consent:doc-1' }
type Repo = Parameters<typeof signoffPortfolioReview>[0]
function fake(value: Record<string, unknown>, imgs: Record<string, unknown>[],
  evidence: Record<string, unknown>[], counts: number[]): Repo {
  return { db: { drizzle: { transaction: async (fn: (tx: {
    execute: () => Promise<{ rows: unknown[] }>
  }) => Promise<unknown>) => fn({ execute: async () => {
    counts.push(1)
    return { rows: counts.length === 1 ? [value]
      : counts.length === 2 ? imgs
        : counts.length === 3 ? evidence : [{ id: 41 }] }
  }) } } } as unknown as Repo
}

test('parse exact signoff contract with minimum reviewer explanation', () => {
  assert.deepEqual(parsePortfolioSignoff({
    outcome: 'review_complete', note: '  Checked all attached records  ',
  }), { outcome: 'review_complete', note: 'Checked all attached records' })
  for (const body of [
    null, {}, { outcome: 'approved', note: 'Finished' },
    { outcome: 'review_complete', note: '' },
    { outcome: 'review_complete', note: 'Fine' },
    { outcome: 'review_complete', note: 'Valid note', publish: true },
  ]) assert.throws(() => parsePortfolioSignoff(body), RangeError)
})

test('finalizes review-only document coverage without publishing media', async () => {
  const calls: number[] = []
  const outcome = await signoffPortfolioReview(fake(record, [image], [reviewed], calls),
    { id: 3, role: 'admin' }, 11,
    { outcome: 'review_complete', note: 'All evidence files reviewed' })
  assert.deepEqual(outcome, {
    id: 41, revisionId: 11, outcome: 'review_complete', imageCount: 1,
  })
  assert.equal(calls.length, 4)
  assert.doesNotMatch(JSON.stringify(outcome), /consent|rights|private|content/)
})

test('incomplete, rejected, or superseded evidence blocks positive signoff', async () => {
  for (const events of [
    [], [{ ...reviewed, outcome: 'needs_evidence' }],
    [{ ...reviewed, outcome: 'rejected' }],
    [{ ...reviewed, consent_reference: null }],
    [{ ...reviewed, media_id: 99 }],
  ]) {
    const calls: number[] = []
    await assert.rejects(signoffPortfolioReview(fake(record, [image], events, calls),
      { id: 3, role: 'admin' }, 11,
      { outcome: 'review_complete', note: 'Documentation was examined' }),
    PortfolioSignoffConflict)
    assert.equal(calls.length, 3)
  }
})

test('return for evidence is possible with incomplete reviews, still no publication', async () => {
  const result = await signoffPortfolioReview(fake(record, [image], [], []),
    { id: 3, role: 'admin' }, 11,
    { outcome: 'returned_for_evidence', note: 'Need a signed consent document' })
  assert.equal(result.outcome, 'returned_for_evidence')
})

test('invalid roles, stale revision and changed files fail closed before insert', async () => {
  const unauthorized: number[] = []
  await assert.rejects(signoffPortfolioReview(fake(record, [image], [reviewed], unauthorized),
    { id: 3, role: 'location_admin' }, 11,
    { outcome: 'review_complete', note: 'Reviewed docs' }), PortfolioSignoffConflict)
  assert.equal(unauthorized.length, 0)
  for (const [revision, photos, maxCalls] of [
    [{ ...record, status: 'draft' }, [image], 1],
    [{ ...record, current_owner_id: 8 }, [image], 1],
    [{ ...record, submitted_manifest_hash: 'a'.repeat(64) }, [image], 2],
    [record, [{ ...image, content: Buffer.from('corruption') }], 2],
    [record, [], 2],
  ] as Array<[Record<string, unknown>, Record<string, unknown>[], number]>) {
    const calls: number[] = []
    await assert.rejects(signoffPortfolioReview(fake(revision, photos, [reviewed], calls),
      { id: 3, role: 'admin' }, 11,
      { outcome: 'review_complete', note: 'Reviewed documents' }),
    PortfolioSignoffConflict)
    assert.equal(calls.length, maxCalls)
  }
})
