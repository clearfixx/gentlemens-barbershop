import assert from 'node:assert/strict'
import test from 'node:test'
import {
  localizedBiographyRevision,
  validateLocalizedBiographyProposal,
} from './professional-localized-biography.ts'
import { approveProfessionalLocalizedBiography } from './approve-professional-localized-biography.ts'

const input = { barberId: 7, locationId: 4, authorId: 11, locale: 'uk' as const, value: 'Старий текст' }
const proposal = {
  id: 15, barber_id: 7, location_id: 4, author_id: 11,
  status: 'pending', barber_user_id: 11, barber_location_id: 4,
  snapshot: { localizedBio: { locale: 'uk', value: 'Старий текст' } },
  changes: { localizedBio: { locale: 'uk', value: 'Новий текст' } },
  base_revision: localizedBiographyRevision(input),
}
type Db = Parameters<typeof approveProfessionalLocalizedBiography>[0]
function fake(
  value: Record<string, unknown>,
  steps: number[],
  localizedValue: string | null = 'Старий текст',
): Db {
  return { db: { drizzle: { transaction: async (cb: (tx: {
    execute: () => Promise<{ rows: unknown[] }>
  }) => Promise<unknown>) => cb({ execute: async () => {
    steps.push(1)
    if (steps.length === 1) return { rows: [value] }
    if (steps.length === 2) return { rows: [{ localized_bio: localizedValue }] }
    return { rows: [{ id: 15 }] }
  } }) } } } as unknown as Db
}

test('revision is locale-specific and owner-bound', () => {
  assert.notEqual(localizedBiographyRevision(input),
    localizedBiographyRevision({ ...input, locale: 'en' }))
  assert.notEqual(localizedBiographyRevision(input),
    localizedBiographyRevision({ ...input, value: 'Інший текст' }))
  assert.notEqual(localizedBiographyRevision(input),
    localizedBiographyRevision({ ...input, authorId: 12 }))
})

test('one locale patch must be strict and meaningful', () => {
  assert.deepEqual(validateLocalizedBiographyProposal(
    proposal.snapshot, proposal.changes,
  ), { locale: 'uk', previous: 'Старий текст', proposed: 'Новий текст' })
  for (const bad of [
    { localizedBio: { locale: 'en', value: 'Other' } },
    { localizedBio: { locale: 'uk', value: 'Старий текст' } },
    { localizedBio: { locale: 'uk', value: 'New', photo: 12 } },
    { localizedBio: { locale: 'fr', value: 'New' } },
    { localizedBio: { locale: 'uk', value: { text: 'New' } } },
    { localizedBio: { locale: 'uk', value: 'New' }, portrait: 123 },
  ]) assert.throws(() => validateLocalizedBiographyProposal(proposal.snapshot, bad), RangeError)
})

test('approved localized biography performs complete atomic sequence', async () => {
  const steps: number[] = []
  const outcome = await approveProfessionalLocalizedBiography(fake(proposal, steps),
    15, { id: 2, role: 'admin' })
  assert.deepEqual(outcome, {
    id: 15, status: 'approved', locale: 'uk',
    appliedRevision: localizedBiographyRevision({ ...input, value: 'Новий текст' }),
  })
  assert.equal(steps.length, 6)
})

test('stale locale, unsupported fields, role and owner fail closed', async () => {
  for (const patch of [
    { status: 'approved' },
    { barber_user_id: 99 },
    { barber_location_id: 33 },
    { base_revision: 'x'.repeat(64) },
    { changes: { localizedBio: { locale: 'uk', value: 'New' }, portrait: 12 } },
  ]) {
    const steps: number[] = []
    await assert.rejects(approveProfessionalLocalizedBiography(fake({
      ...proposal, ...patch,
    }, steps), 15, { id: 2, role: 'admin' }))
    assert.equal(steps.length, patch.base_revision ? 2 : 1)
  }
  const stale: number[] = []
  await assert.rejects(approveProfessionalLocalizedBiography(
    fake(proposal, stale, 'Someone else edited this'), 15, { id: 2, role: 'admin' }),
  )
  assert.equal(stale.length, 2)
  await assert.rejects(approveProfessionalLocalizedBiography(
    fake(proposal, [], null), 15, { id: 2, role: 'location_admin' },
  ), /forbidden/)
})
