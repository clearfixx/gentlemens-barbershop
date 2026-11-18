import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import {
  preparePrivatePortfolioCandidates, withdrawPrivatePortfolioCandidate,
  PortfolioCandidateConflict,
} from './private-portfolio-candidates.ts'

const bytes = Buffer.from('private candidate fixture')
const sha = createHash('sha256').update(bytes).digest('hex')
const item = { mediaId: 6, alt: 'Private portrait photo', sortOrder: 0,
  rightsDeclared: true, clientConsentDeclared: true }
const row = {
  id: 19, status: 'pending', barber_id: 4, location_id: 3,
  author_id: 7, owner_id: 7, current_location_id: 3,
  submitted_manifest_hash: computeSubmittedPortfolioManifest({
    barberId: 4, locationId: 3, authorId: 7,
  }, [item], [{ id: 6, mime: 'image/png', size: bytes.length, sha }]),
  changes: { portfolio: { items: [item] } },
}
const media = { id: 6, barber_id: 4, location_id: 3, uploaded_by_id: 7,
  mime_type: 'image/png', size_bytes: bytes.length, sha256: sha, content: bytes }
const evidence = { media_id: 6, outcome: 'evidence_reviewed',
  rights_reference: 'rights:test', consent_reference: 'consent:test' }
type Repo = Parameters<typeof preparePrivatePortfolioCandidates>[0]
function fake(
  revision: Record<string, unknown>,
  opts: { existing?: boolean; signoff?: boolean; media?: Record<string, unknown>[];
    evidence?: Record<string, unknown>[]; admin?: boolean } = {},
  count: number[] = [],
): Repo {
  const tx = { execute: async (): Promise<{ rows: unknown[] }> => {
    count.push(1)
    const rows: unknown[][] = [
      [revision],
      [], // No precautionary holds on this fixture.
      opts.existing ? [{ id: 90 }] : [],
      opts.signoff === false ? [] : [{ id: 51 }],
      opts.media ?? [media],
      opts.evidence ?? [evidence],
      opts.admin === false ? [] : [{ id: 2 }],
      [{ id: 77 }],
      [{ id: 88 }],
    ]
    return { rows: rows[count.length - 1] ?? [] }
  } }
  return { db: { drizzle: { transaction: async (callback: (t: typeof tx) => Promise<unknown>) =>
    callback(tx) } } } as unknown as Repo
}

test('prepares private-only candidate after documentary signoff and media verification', async () => {
  const calls: number[] = []
  const result = await preparePrivatePortfolioCandidates(fake(row, {}, calls),
    { id: 2, role: 'admin' }, 19, 'Reviewed documentary source')
  assert.deepEqual(result, { revisionId: 19, preparedCount: 1 })
  assert.equal(calls.length, 9)
})

test('missing signoff or insufficient/changed evidence blocks preparation', async () => {
  for (const opts of [
    { existing: true }, { signoff: false }, { media: [] },
    { media: [{ ...media, content: Buffer.from('tampered') }] },
    { evidence: [] }, { evidence: [{ ...evidence, outcome: 'rejected' }] },
    { admin: false },
  ]) {
    await assert.rejects(preparePrivatePortfolioCandidates(fake(row, opts),
      { id: 2, role: 'admin' }, 19, 'Checked all source records'), PortfolioCandidateConflict)
  }
})

test('wrong owner, location, status or role never prepares candidates', async () => {
  for (const variant of [
    { ...row, status: 'draft' }, { ...row, owner_id: 15 },
    { ...row, current_location_id: 99 }, { ...row, author_id: 2 },
    { ...row, submitted_manifest_hash: 'f'.repeat(64) },
  ]) {
    await assert.rejects(preparePrivatePortfolioCandidates(fake(variant),
      { id: 2, role: 'admin' }, 19, 'Reviewed evidence'), PortfolioCandidateConflict)
  }
  await assert.rejects(preparePrivatePortfolioCandidates(fake(row),
    { id: 2, role: 'location_admin' }, 19, 'Reviewed evidence'), PortfolioCandidateConflict)
})

test('withdrawal requires admin and records reason in same transaction', async () => {
  const calls: number[] = []
  const tx = { execute: async (): Promise<{ rows: unknown[] }> => {
    calls.push(1)
    return { rows: [{ id: 31 }] }
  } }
  const payload = { db: { drizzle: { transaction: async (fn: (t: typeof tx) => Promise<unknown>) =>
    fn(tx) } } } as unknown as Repo
  assert.deepEqual(await withdrawPrivatePortfolioCandidate(payload,
    { id: 2, role: 'admin' }, 31, 'Consent withdrawn'), { id: 31, status: 'withdrawn' })
  assert.equal(calls.length, 2)
  await assert.rejects(withdrawPrivatePortfolioCandidate(payload,
    { id: 2, role: 'barber' }, 31, 'Consent withdrawn'), PortfolioCandidateConflict)
  await assert.rejects(withdrawPrivatePortfolioCandidate(payload,
    { id: 2, role: 'admin' }, 31, 'x'), RangeError)
})
