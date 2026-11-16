import assert from 'node:assert/strict'
import test from 'node:test'
import { biographyRevision, validateBiographyProposal } from './professional-biography-revision.ts'
import { approveProfessionalBiography } from './approve-professional-biography.ts'

const base = { barberId: 7, locationId: 3, authorId: 11, bio: 'Old bio' }
const valid = {
  id: 22, author_id: 11, barber_id: 7, location_id: 3, status: 'pending',
  base_revision: biographyRevision(base), snapshot: { bio: 'Old bio' },
  changes: { bio: 'New bio' }, barber_user_id: 11, barber_location_id: 3,
  published_bio: 'Old bio',
}
type Db = Parameters<typeof approveProfessionalBiography>[0]
function stub(row: Record<string, unknown>, actions: number[], changed = true): Db {
  return { db: { drizzle: { transaction: async (
    callback: (tx: { execute: (query: unknown) => Promise<{ rows: unknown[] }> }) => Promise<unknown>,
  ) => callback({ execute: async () => {
    actions.push(1)
    if (actions.length === 1) return { rows: [row] }
    return { rows: changed ? [{ id: 22 }] : [] }
  } }) } } } as unknown as Db
}

test('canonical revision is stable and bound to barber and owner', () => {
  assert.equal(biographyRevision(base), biographyRevision({ ...base }))
  assert.notEqual(biographyRevision(base), biographyRevision({ ...base, authorId: 12 }))
  assert.notEqual(biographyRevision(base), biographyRevision({ ...base, bio: 'Changed' }))
})

test('only biography-only structured proposals may be approved', () => {
  assert.deepEqual(validateBiographyProposal({ bio: 'Old' }, { bio: 'New' }), {
    previous: 'Old', proposed: 'New',
  })
  for (const proposal of [
    { bio: 'New', portrait: 99 },
    { localizedBio: 'New' },
    { bio: { html: 'New' } },
    { bio: 'Old' },
  ]) {
    assert.throws(() => validateBiographyProposal({ bio: 'Old' }, proposal), RangeError)
  }
})

test('approved biography transaction writes barber and decision exactly once', async () => {
  const actions: number[] = []
  const result = await approveProfessionalBiography(stub(valid, actions), 22,
    { id: 5, role: 'admin' })
  assert.equal(result.status, 'approved')
  assert.equal(result.id, 22)
  assert.equal(result.appliedRevision, biographyRevision({ ...base, bio: 'New bio' }))
  assert.equal(actions.length, 3)
})

test('unsubmitted, stale, unlinked or unsupported proposals never mutate barber', async () => {
  for (const altered of [
    { status: 'draft' },
    { status: 'approved' },
    { barber_user_id: 12 },
    { barber_location_id: 4 },
    { published_bio: 'Other' },
    { base_revision: 'f'.repeat(64) },
    { changes: { bio: 'New', portrait: 99 } },
  ]) {
    const actions: number[] = []
    await assert.rejects(approveProfessionalBiography(stub({ ...valid, ...altered }, actions),
      22, { id: 5, role: 'admin' }))
    assert.equal(actions.length, 1)
  }
})

test('write failure and role restriction fail closed', async () => {
  const actions: number[] = []
  await assert.rejects(approveProfessionalBiography(stub(valid, actions, false),
    22, { id: 5, role: 'admin' }), /conflict/)
  assert.equal(actions.length, 2)
  const unauthorized: number[] = []
  await assert.rejects(approveProfessionalBiography(stub(valid, unauthorized),
    22, { id: 5, role: 'location_admin' }), /forbidden/)
  assert.equal(unauthorized.length, 0)
  const self: number[] = []
  await assert.rejects(approveProfessionalBiography(stub(valid, self),
    22, { id: 11, role: 'admin' }), /self-approval/)
  assert.equal(self.length, 1)
})
