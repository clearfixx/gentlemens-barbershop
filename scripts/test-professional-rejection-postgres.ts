import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../src/payload.config.ts'
import { rejectProfessionalProposal } from '../src/lib/admin/reject-professional-proposal.ts'
import { approveProfessionalBiography } from '../src/lib/admin/approve-professional-biography.ts'
import { biographyRevision } from '../src/lib/admin/professional-biography-revision.ts'
import { approveProfessionalLocalizedBiography } from '../src/lib/admin/approve-professional-localized-biography.ts'
import { localizedBiographyRevision } from '../src/lib/admin/professional-localized-biography.ts'
import { ProfessionalReviewConflictError } from '../src/lib/admin/professional-approval-policy.ts'
import { listPrivatePortfolioReviewMedia, readPrivatePortfolioReviewImage, PrivatePortfolioMediaNotFound } from '../src/lib/admin/private-portfolio-review-media.ts'
import { stagePrivatePortfolioImage, PrivatePortfolioUploadForbidden } from '../src/lib/admin/stage-private-portfolio-image.ts'
import { submitPrivatePortfolioDraft, PortfolioSubmissionConflict } from '../src/lib/admin/submit-private-portfolio-draft.ts'

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
    collection: 'users' | 'locations' | 'barbers' | 'barber-profile-revisions' | 'location-assignments'
    id: number
  }> = []
  const add = <T extends { id: number | string }>(collection: typeof cleanup[number]['collection'], value: T): T => {
    cleanup.push({ collection, id: Number(value.id) })
    return value
  }
  let privateMediaId: number | null = null
  let stagedImageId: number | null = null
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
    // Private bytes live outside public Payload media and require a current
    // staff role and branch assignment on every image request.
    const sampleImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
      'base64',
    )
    const imageHash = createHash('sha256').update(sampleImage).digest('hex')
    const storedImage = await payload.db.drizzle.execute(sql`
      INSERT INTO private_barber_portfolio_media
        (revision_id, barber_id, location_id, uploaded_by_id,
         mime_type, size_bytes, sha256, content)
      VALUES (${Number(proposal.id)}, ${Number(barber.id)}, ${Number(location.id)},
        ${Number(barberUser.id)}, 'image/png', ${sampleImage.length},
        ${imageHash}, ${sampleImage})
      RETURNING id
    `)
    privateMediaId = Number(storedImage.rows[0]?.id)
    assert.ok(privateMediaId > 0)
    const staff = { id: Number(network.id), role: 'admin' as const }
    const staffList = await listPrivatePortfolioReviewMedia(payload, staff, Number(proposal.id))
    assert.deepEqual(staffList, [{ id: privateMediaId,
      mimeType: 'image/png', sizeBytes: sampleImage.length }])
    const staffPreview = await readPrivatePortfolioReviewImage(
      payload, staff, Number(proposal.id), privateMediaId)
    assert.deepEqual(Buffer.from(staffPreview.bytes), sampleImage)
    const manager = add('users', await payload.create({
      collection: 'users', overrideAccess: true,
      data: { email: `portfolio-manager-${suffix}@example.invalid`,
        password: 'ci-only-private-media', role: 'location_admin' },
    }))
    const managerId = Number(manager.id)
    await assert.rejects(readPrivatePortfolioReviewImage(payload, {
      id: managerId, role: 'location_admin',
    }, Number(proposal.id), privateMediaId), PrivatePortfolioMediaNotFound)
    const assignment = add('location-assignments', await payload.create({
      collection: 'location-assignments', overrideAccess: true,
      data: { user: managerId, location: Number(location.id), isActive: true },
    }))
    const scopedPreview = await readPrivatePortfolioReviewImage(payload, {
      id: managerId, role: 'location_admin',
    }, Number(proposal.id), privateMediaId)
    assert.deepEqual(Buffer.from(scopedPreview.bytes), sampleImage)
    await payload.update({ collection: 'location-assignments',
      id: assignment.id, overrideAccess: true, data: { isActive: false } })
    await assert.rejects(readPrivatePortfolioReviewImage(payload, {
      id: managerId, role: 'location_admin',
    }, Number(proposal.id), privateMediaId), PrivatePortfolioMediaNotFound)
    await assert.rejects(readPrivatePortfolioReviewImage(payload, {
      id: Number(barberUser.id), role: 'location_admin',
    }, Number(proposal.id), privateMediaId), PrivatePortfolioMediaNotFound)
    // Unsubmitted drafts are not visible even to a network admin.
    const draft = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: { barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'draft',
        baseRevision: 'a'.repeat(64), snapshot: { bio: 'draft' },
        changes: { portfolio: { items: [] } } },
    }))
    await assert.rejects(readPrivatePortfolioReviewImage(payload, staff,
      Number(draft.id), privateMediaId), PrivatePortfolioMediaNotFound)
    // A verified BARBER can only add sanitized bytes to their own DRAFT.
    // An admin cannot impersonate the author or upload to a submitted revision.
    const pngWithMetadata = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAF3RFWHRjb21tZW50AHNlY3JldC1tZXRhZGF0YdHOKngAAAANSURBVHicY/jPwPAfAAUAAf+JmT0dAAAAAElFTkSuQmCC',
      'base64',
    )
    const staged = await stagePrivatePortfolioImage(payload, {
      id: Number(barberUser.id), role: 'barber',
    }, Number(draft.id), pngWithMetadata)
    stagedImageId = staged.id
    assert.ok(staged.sizeBytes < pngWithMetadata.length, 'PNG metadata must be removed')
    await assert.rejects(stagePrivatePortfolioImage(payload, {
      id: Number(network.id), role: 'admin',
    }, Number(draft.id), pngWithMetadata), PrivatePortfolioUploadForbidden)
    await assert.rejects(readPrivatePortfolioReviewImage(
      payload, staff, Number(draft.id), staged.id), PrivatePortfolioMediaNotFound)
    const submitted = await submitPrivatePortfolioDraft(payload, {
      id: Number(barberUser.id), role: 'barber',
    }, Number(draft.id), {
      items: [{
        mediaId: staged.id, alt: 'CI private haircut', caption: 'Verified draft',
        sortOrder: 0, rightsDeclared: true, clientConsentDeclared: true,
      }],
    })
    assert.equal(submitted.status, 'pending')
    assert.equal(submitted.mediaCount, 1)
    assert.match(submitted.manifestSha256, /^[0-9a-f]{64}$/)
    const submittedRecord = await payload.findByID({
      collection: 'barber-profile-revisions', id: draft.id,
      overrideAccess: true, depth: 0,
    })
    assert.equal(submittedRecord.status, 'pending')
    assert.equal(submittedRecord.submittedManifestHash, submitted.manifestSha256)
    assert.deepEqual(submittedRecord.changes, {
      portfolio: { items: [{
        mediaId: staged.id, alt: 'CI private haircut', caption: 'Verified draft',
        sortOrder: 0, rightsDeclared: true, clientConsentDeclared: true,
      }] },
    })
    await assert.rejects(submitPrivatePortfolioDraft(payload, {
      id: Number(barberUser.id), role: 'barber',
    }, Number(draft.id), { items: [{
      mediaId: staged.id, alt: 'Changed after submission', sortOrder: 0,
      rightsDeclared: true, clientConsentDeclared: true,
    }] }), PortfolioSubmissionConflict)
    const submittedPreview = await readPrivatePortfolioReviewImage(
      payload, staff, Number(draft.id), staged.id)
    assert.equal(submittedPreview.mimeType, 'image/png')
    assert.equal(Buffer.from(submittedPreview.bytes).includes(Buffer.from('secret-metadata')), false)
    await assert.rejects(stagePrivatePortfolioImage(payload, {
      id: Number(barberUser.id), role: 'barber',
    }, Number(draft.id), pngWithMetadata), PrivatePortfolioUploadForbidden)
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
    // Payload stores translations in a separate locale table. Publishing
    // English must not alter Ukrainian, including under stale/replay attempts.
    await payload.update({
      collection: 'barbers', id: barber.id, overrideAccess: true, locale: 'uk',
      data: { localizedBio: 'Українська біографія' },
    })
    await payload.update({
      collection: 'barbers', id: barber.id, overrideAccess: true, locale: 'en',
      data: { localizedBio: 'Old English biography' },
    })
    const localeRevision = (locale: 'uk' | 'en', value: string | null) =>
      localizedBiographyRevision({
        barberId: Number(barber.id), locationId: Number(location.id),
        authorId: Number(barberUser.id), locale, value,
      })
    const translated = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: localeRevision('en', 'Old English biography'),
        snapshot: { localizedBio: { locale: 'en', value: 'Old English biography' } },
        changes: { localizedBio: { locale: 'en', value: 'Approved English biography' } },
      },
    }))
    const localizedApproved = await approveProfessionalLocalizedBiography(
      payload, Number(translated.id), { id: Number(network.id), role: 'admin' })
    assert.deepEqual(localizedApproved, {
      id: Number(translated.id), status: 'approved', locale: 'en',
      appliedRevision: localeRevision('en', 'Approved English biography'),
    })
    const translations = await payload.db.drizzle.execute(sql`
      SELECT _locale::text AS locale, localized_bio AS bio
      FROM barbers_locales WHERE _parent_id = ${Number(barber.id)}
      ORDER BY _locale::text
    `)
    assert.deepEqual(translations.rows.map(row => ({ locale: row.locale, bio: row.bio })),
      [
        { locale: 'uk', bio: 'Українська біографія' },
        { locale: 'en', bio: 'Approved English biography' },
      ].sort((a, b) => a.locale.localeCompare(b.locale)))
    const translatedDecision = await payload.findByID({
      collection: 'barber-profile-revisions', id: translated.id,
      depth: 0, overrideAccess: true,
    })
    assert.equal(translatedDecision.status, 'approved')
    assert.equal(translatedDecision.reviewer, network.id)
    assert.equal(translatedDecision.appliedRevision, localizedApproved.appliedRevision)
    await assert.rejects(approveProfessionalLocalizedBiography(
      payload, Number(translated.id), { id: Number(network.id), role: 'admin' }),
    ProfessionalReviewConflictError)

    const staleTranslation = add('barber-profile-revisions', await payload.create({
      collection: 'barber-profile-revisions', overrideAccess: true,
      data: {
        barber: Number(barber.id), location: Number(location.id),
        author: Number(barberUser.id), status: 'pending',
        baseRevision: localeRevision('en', 'Old English biography'),
        snapshot: { localizedBio: { locale: 'en', value: 'Old English biography' } },
        changes: { localizedBio: { locale: 'en', value: 'Stale English biography' } },
      },
    }))
    await assert.rejects(approveProfessionalLocalizedBiography(
      payload, Number(staleTranslation.id), { id: Number(network.id), role: 'admin' }),
    ProfessionalReviewConflictError)
    const staleRecord = await payload.findByID({
      collection: 'barber-profile-revisions', id: staleTranslation.id,
      depth: 0, overrideAccess: true,
    })
    assert.equal(staleRecord.status, 'pending')
    const afterLocalized = await payload.findByID({
      collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true,
    })
    assert.equal(afterLocalized.bio, 'Approved public biography')
    console.info('Professional rejection and biography/locale publication PostgreSQL integration passed')
  } finally {
    if (stagedImageId !== null) {
      await payload.db.drizzle.execute(sql`DELETE FROM private_barber_portfolio_media WHERE id = ${stagedImageId}`)
    }
    if (privateMediaId !== null) {
      await payload.db.drizzle.execute(sql`DELETE FROM private_barber_portfolio_media WHERE id = ${privateMediaId}`)
    }
    for (const item of cleanup.reverse()) {
      await payload.delete({ collection: item.collection, id: item.id, overrideAccess: true })
    }
  }
}
run().then(() => process.exit(0), error => {
  console.error('Professional rejection integration failed', error)
  process.exit(1)
})
