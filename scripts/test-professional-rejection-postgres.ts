import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { rejectProfessionalProposal } from '../src/lib/admin/reject-professional-proposal.ts'
import { ProfessionalReviewConflictError } from '../src/lib/admin/professional-approval-policy.ts'

/** Disposable full-schema integration: rejection must never mutate the public
 * barber record and must persist a single final decision under row locks.
 */
async function run() {
  if (process.env.ADMIN_APPROVAL_INTEGRATION !== 'isolated') {
    throw new Error('Professional rejection integration requires isolated migrated DB')
  }
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 12)
  const cleanup: Array<{
    collection: 'users' | 'locations' | 'barbers' | 'barber-profile-revisions'
    id: number
  }> = []
  const add = <T extends { id: number | string }>(collection: typeof cleanup[number]['collection'], value: T): T => {
    cleanup.push({ collection, id: Number(value.id) })
    return value
  }
  try {
    const network = add('users', await payload.create({ collection: 'users', overrideAccess: true,
      data: { email: `professional-admin-${suffix}@example.invalid`,
        password: 'ci-only-professional-test-pass', role: 'admin' },
    }))
    const barberUser = add('users', await payload.create({ collection: 'users', overrideAccess: true,
      data: { email: `professional-barber-${suffix}@example.invalid`,
        password: 'ci-only-professional-test-pass', role: 'barber' },
    }))
    const location = add('locations', await payload.create({ collection: 'locations', overrideAccess: true,
      data: { name: 'Professional review CI', city: 'Test', address: 'CI avenue',
        slug: `professional-review-${suffix}`, isActive: true,
        timeZone: 'Europe/Kyiv', cancellationDeadlineMinutes: 60 },
    }))
    const barber = add('barbers', await payload.create({ collection: 'barbers', overrideAccess: true,
      data: { name: 'Professional review CI barber', slug: `review-barber-${suffix}`,
        location: Number(location.id), user: Number(barberUser.id),
        bio: 'Published biography', isActive: true },
    }))
    const proposal = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: 'a'.repeat(64),
        snapshot: { bio: 'Published biography' }, changes: { bio: 'Unpublished biography' },
      },
    }))
    const result = await rejectProfessionalProposal(payload, Number(proposal.id),
      { id: Number(network.id), role: 'admin' }, 'Insufficient verification')
    assert.deepEqual(result, { id: Number(proposal.id), status: 'rejected' })
    const reviewed = await payload.findByID({ collection: 'barber-profile-revisions',
      id: proposal.id, overrideAccess: true, depth: 0 })
    assert.equal(reviewed.status, 'rejected')
    assert.equal(reviewed.rejectionReason, 'Insufficient verification')
    assert.equal(reviewed.reviewer, network.id)
    assert.ok(reviewed.reviewedAt)
    const published = await payload.findByID({ collection: 'barbers',
      id: barber.id, overrideAccess: true, depth: 0 })
    assert.equal(published.bio, 'Published biography')
    await assert.rejects(rejectProfessionalProposal(payload, Number(proposal.id),
      { id: Number(network.id), role: 'admin' }, 'Second review'),
    ProfessionalReviewConflictError)
    console.info('Professional rejection PostgreSQL transaction integration passed')
  } finally {
    for (const item of cleanup.reverse()) {
      await payload.delete({ collection: item.collection, id: item.id, overrideAccess: true })
    }
  }
}
run().then(() => process.exit(0), error => {
  console.error('Professional rejection integration failed', error)
  process.exit(1)
})
