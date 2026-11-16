import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import { verifySubmittedPortfolioForStaff, PortfolioReviewUnavailable } from './verify-submitted-portfolio.ts'

const bytes = Buffer.from('private-test-image')
const media = { id: 31, barber_id: 4, location_id: 3, uploaded_by_id: 7,
  mime_type: 'image/png', size_bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), content: bytes }
const item = { mediaId: 31, alt: 'Cut side view', caption: 'Styled result',
  sortOrder: 0, rightsDeclared: true, clientConsentDeclared: true }
const revision = {
  id: 18, barber_id: 4, location_id: 3, author_id: 7,
  status: 'pending', changes: { portfolio: { items: [item] } },
  submitted_manifest_hash: computeSubmittedPortfolioManifest({
    barberId: 4, locationId: 3, authorId: 7,
  }, [item], [{ id: 31, mime: 'image/png', size: bytes.length, sha: media.sha256 }]),
}
type Repo = Parameters<typeof verifySubmittedPortfolioForStaff>[0]
function fake(record: Record<string, unknown> | null, photos: Record<string, unknown>[], steps: number[]): Repo {
  return { db: { drizzle: { transaction: async (callback: (tx: {
    execute: (query: unknown) => Promise<{ rows: unknown[] }>
  }) => Promise<unknown>) => callback({
    execute: async () => {
      steps.push(1)
      return { rows: steps.length === 1 ? record ? [record] : [] : photos }
    },
  }) } } } as unknown as Repo
}
const actor = { id: 8, role: 'location_admin' as const }

test('independently verifies exact private photo bytes and canonical manifest', async () => {
  const calls: number[] = []
  const found = await verifySubmittedPortfolioForStaff(fake(revision, [media], calls), actor, 18)
  assert.deepEqual(found, { status: 'verified', imageCount: 1,
    checks: { metadata: true, imageSet: true, imageBytes: true, manifest: true } })
  assert.equal(calls.length, 2)
  assert.doesNotMatch(JSON.stringify(found), /private-test-image|caption|sha256/)
})

test('tampered bytes, alternate ID and changed metadata are never certified', async () => {
  for (const [record, photos] of [
    [revision, [{ ...media, content: Buffer.from('modified file') }]],
    [revision, [{ ...media, id: 88 }]],
    [{ ...revision, changes: { portfolio: { items: [{ ...item, caption: 'Changed!' }] } } }, [media]],
    [revision, [{ ...media, location_id: 9 }]],
    [revision, []],
  ] as Array<[Record<string, unknown>, Record<string, unknown>[]]>) {
    const result = await verifySubmittedPortfolioForStaff(fake(record, photos, []), actor, 18)
    assert.equal(result.status, 'mismatch')
  }
})

test('missing submission fingerprint is a noncertified legacy review', async () => {
  const result = await verifySubmittedPortfolioForStaff(
    fake({ ...revision, submitted_manifest_hash: null }, [media], []), actor, 18)
  assert.equal(result.status, 'not_submitted')
  assert.equal(result.checks.manifest, false)
})

test('private draft, invalid user and denied scope are not inspectable', async () => {
  await assert.rejects(verifySubmittedPortfolioForStaff(fake(null, [], []), actor, 18),
    PortfolioReviewUnavailable)
  await assert.rejects(verifySubmittedPortfolioForStaff(fake(revision, [media], []),
    { id: 0, role: 'admin' }, 18), PortfolioReviewUnavailable)
  await assert.rejects(verifySubmittedPortfolioForStaff(fake(revision, [media], []),
    actor, -2), PortfolioReviewUnavailable)
})

test('canonical checksum is insensitive to item-array order, not field changes', () => {
  const second = { ...item, mediaId: 32, sortOrder: 1 }
  const custody = [
    { id: 31, mime: 'image/png', size: bytes.length, sha: media.sha256 },
    { id: 32, mime: 'image/png', size: bytes.length, sha: media.sha256 },
  ]
  const ids = { barberId: 4, locationId: 3, authorId: 7 }
  assert.equal(computeSubmittedPortfolioManifest(ids, [second, item], custody),
    computeSubmittedPortfolioManifest(ids, [item, second], custody))
  assert.notEqual(computeSubmittedPortfolioManifest(ids, [item, second], custody),
    computeSubmittedPortfolioManifest(ids, [item, { ...second, alt: 'Updated photo' }], custody))
})
