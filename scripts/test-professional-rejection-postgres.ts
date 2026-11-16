import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { rejectProfessionalProposal } from '../src/lib/admin/reject-professional-proposal.ts'
import { approveProfessionalBiography } from '../src/lib/admin/approve-professional-biography.ts'
import { biographyRevision } from '../src/lib/admin/professional-biography-revision.ts'
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
    // The first approved field is deliberately restricted to a biography.
    const makeRevision = (bio: string) => biographyRevision({
      barberId: Number(barber.id), locationId: Number(location.id),
      authorId: Number(barberUser.id), bio,
    })
    const approvedProposal = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: makeRevision('Published biography'),
        snapshot: { bio: 'Published biography' },
        changes: { bio: 'Approved public biography' },
      },
    }))
    const approved = await approveProfessionalBiography(payload, Number(approvedProposal.id),
      { id: Number(network.id), role: 'admin' })
    assert.equal(approved.status, 'approved')
    assert.equal(approved.appliedRevision, makeRevision('Approved public biography'))
    const verified = await payload.findByID({
      collection: 'barber-profile-revisions', id: approvedProposal.id,
      overrideAccess: true, depth: 0,
    })
    assert.equal(verified.status, 'approved')
    assert.equal(verified.appliedRevision, approved.appliedRevision)
    assert.equal(verified.reviewer, network.id)
    const publishedAfter = await payload.findByID({
      collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true,
    })
    assert.equal(publishedAfter.bio, 'Approved public biography')
    await assert.rejects(approveProfessionalBiography(payload, Number(approvedProposal.id),
      { id: Number(network.id), role: 'admin' }), ProfessionalReviewConflictError)

    const stale = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: makeRevision('Published biography'),
        snapshot: { bio: 'Published biography' },
        changes: { bio: 'Should not publish' },
      },
    }))
    await assert.rejects(approveProfessionalBiography(payload, Number(stale.id),
      { id: Number(network.id), role: 'admin' }), ProfessionalReviewConflictError)
    const afterStale = await payload.findByID({
      collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true,
    })
    assert.equal(afterStale.bio, 'Approved public biography')
    const staleRequest = await payload.findByID({
      collection: 'barber-profile-revisions', id: stale.id,
      depth: 0, overrideAccess: true,
    })
    assert.equal(staleRequest.status, 'pending')

    const unsupported = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: makeRevision('Approved public biography'),
        snapshot: { bio: 'Approved public biography' },
        changes: { bio: 'Should not publish', portrait: 123 },
      },
    }))
    await assert.rejects(approveProfessionalBiography(payload, Number(unsupported.id),
      { id: Number(network.id), role: 'admin' }), /unsupported/)
    console.info('Professional rejection and biography approval PostgreSQL integration passed')
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
