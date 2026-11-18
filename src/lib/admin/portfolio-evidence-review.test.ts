import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import {
  parsePortfolioEvidenceDecision, recordPortfolioEvidenceReview, PortfolioEvidenceConflict,
} from './portfolio-evidence-review.ts'

const bytes = Buffer.from('test-photo-bytes')
const digest = createHash('sha256').update(bytes).digest('hex')
const photo = { id: 4, barber_id: 6, location_id: 3, uploaded_by_id: 8,
  mime_type: 'image/png', size_bytes: bytes.length, sha256: digest, content: bytes }
const item = { mediaId: 4, alt: 'Haircut sample', sortOrder: 0,
  rightsDeclared: true, clientConsentDeclared: true }
const row = { id: 10, author_id: 8, barber_id: 6, location_id: 3, status: 'pending',
  barber_user_id: 8, barber_location_id: 3, changes: { portfolio: { items: [item] } },
  submitted_manifest_hash: computeSubmittedPortfolioManifest({
    barberId: 6, locationId: 3, authorId: 8,
  }, [item], [{ id: 4, mime: 'image/png', size: bytes.length, sha: digest }]) }
const actor = { id: 2, role: 'admin' }
const decision = { outcome: 'evidence_reviewed' as const, note: 'Checked the referenced records',
  rightsReference: 'rights:record-123', consentReference: 'consent:record-987' }
type Repo = Parameters<typeof recordPortfolioEvidenceReview>[0]
function fake(record: Record<string, unknown>, images: Record<string, unknown>[], calls: number[]): Repo {
  return { db: { drizzle: { transaction: async (fn: (tx: { execute: () => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
    fn({ execute: async () => {
      calls.push(1)
      if (calls.length === 1) return { rows: [record] }
      if (calls.length === 2) return { rows: [] } // Not already finalized.
      if (calls.length === 3) return { rows: images }
      return { rows: [{ id: 11 }] }
    } }),
  } } } as unknown as Repo
}

test('review evidence requires specific references and an explanation', () => {
  assert.deepEqual(parsePortfolioEvidenceDecision(decision), {
    ...decision,
  })
  for (const invalid of [
    { outcome: 'evidence_reviewed', note: 'Checked' },
    { ...decision, note: '   ' },
    { ...decision, rightsReference: 'https://untrusted.test' },
    { ...decision, customerName: 'private' },
    { ...decision, outcome: 'approved' },
  ]) assert.throws(() => parsePortfolioEvidenceDecision(invalid), RangeError)
})

test('records one event without publishing or exposing evidence references', async () => {
  const calls: number[] = []
  const result = await recordPortfolioEvidenceReview(fake(row, [photo], calls),
    actor, 10, 4, decision)
  assert.deepEqual(result, { id: 11, revisionId: 10, mediaId: 4,
    outcome: 'evidence_reviewed' })
  assert.equal(calls.length, 4)
  assert.doesNotMatch(JSON.stringify(result), /rights|consent|note/)
})

test('invalid role, stale revision, foreign or tampered media fail closed', async () => {
  const badRole: number[] = []
  await assert.rejects(recordPortfolioEvidenceReview(fake(row, [photo], badRole),
    { id: 2, role: 'location_admin' }, 10, 4, decision), PortfolioEvidenceConflict)
  assert.equal(badRole.length, 0)
  for (const [revision, images, expected] of [
    [{ ...row, status: 'draft' }, [photo], 1],
    [{ ...row, status: 'approved' }, [photo], 1],
    [{ ...row, barber_user_id: 99 }, [photo], 1],
    [row, [{ ...photo, content: Buffer.from('tampered') }], 3],
    [row, [{ ...photo, id: 40 }], 3],
    [{ ...row, submitted_manifest_hash: 'a'.repeat(64) }, [photo], 3],
  ] as Array<[Record<string, unknown>, Record<string, unknown>[], number]>) {
    const calls: number[] = []
    await assert.rejects(recordPortfolioEvidenceReview(fake(revision, images, calls),
      actor, 10, 4, decision), PortfolioEvidenceConflict)
    assert.equal(calls.length, expected)
  }
})
