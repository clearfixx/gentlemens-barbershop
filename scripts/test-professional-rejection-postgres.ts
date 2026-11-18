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
import { verifySubmittedPortfolioForStaff, PortfolioReviewUnavailable } from '../src/lib/admin/verify-submitted-portfolio.ts'
import { recordPortfolioEvidenceReview, PortfolioEvidenceConflict } from '../src/lib/admin/portfolio-evidence-review.ts'
import { listPortfolioEvidenceStatuses } from '../src/lib/admin/portfolio-evidence-statuses.ts'
import { signoffPortfolioReview, PortfolioSignoffConflict } from '../src/lib/admin/portfolio-review-signoff.ts'
import { getPortfolioSignoffStatus } from '../src/lib/admin/portfolio-signoff-status.ts'
import { preparePrivatePortfolioCandidates, withdrawPrivatePortfolioCandidate, PortfolioCandidateConflict } from '../src/lib/admin/private-portfolio-candidates.ts'
import { listPrivatePortfolioCandidates } from '../src/lib/admin/private-portfolio-candidate-list.ts'
import { placePrecautionaryPortfolioHold, listPrecautionaryPortfolioHolds, PortfolioHoldConflict } from '../src/lib/admin/portfolio-precautionary-holds.ts'
import { recordPortfolioHoldCaseEvent, listPortfolioHoldCases, HoldCaseConflict } from '../src/lib/admin/portfolio-hold-cases.ts'
import { loadPortfolioHoldQueue } from '../src/lib/admin/portfolio-hold-queue.ts'

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
    const confirmedIntegrity = await verifySubmittedPortfolioForStaff(
      payload, staff, Number(draft.id))
    assert.equal(confirmedIntegrity.status, 'verified')
    assert.deepEqual(confirmedIntegrity.checks, {
      metadata: true, imageSet: true, imageBytes: true, manifest: true,
    })
    // A revoked branch manager cannot request even the boolean assessment.
    await assert.rejects(verifySubmittedPortfolioForStaff(payload, {
      id: managerId, role: 'location_admin',
    }, Number(draft.id)), PortfolioReviewUnavailable)
    await payload.db.drizzle.execute(sql`
      UPDATE private_barber_portfolio_media
      SET sha256 = ${'0'.repeat(64)} WHERE id = ${staged.id}
    `)
    const tampered = await verifySubmittedPortfolioForStaff(
      payload, staff, Number(draft.id))
    assert.equal(tampered.status, 'mismatch')
    assert.equal(tampered.checks.imageBytes, false)
    assert.equal(tampered.checks.manifest, false)
    // Restore the original custody digest, then verify the same manifest.
    const cleanBytes = await payload.db.drizzle.execute(sql`
      SELECT content FROM private_barber_portfolio_media WHERE id = ${staged.id}
    `)
    const restoredSha = createHash('sha256')
      .update(Buffer.from(cleanBytes.rows[0]!.content as Uint8Array)).digest('hex')
    await payload.db.drizzle.execute(sql`
      UPDATE private_barber_portfolio_media SET sha256 = ${restoredSha}
      WHERE id = ${staged.id}
    `)
    const reverified = await verifySubmittedPortfolioForStaff(
      payload, staff, Number(draft.id))
    assert.equal(reverified.status, 'verified')
    const evidenceDecision = await recordPortfolioEvidenceReview(
      payload, staff, Number(draft.id), staged.id, {
        outcome: 'evidence_reviewed',
        note: 'Reviewed source and consent records in isolated CI',
        rightsReference: 'rights:ci-example',
        consentReference: 'consent:ci-example',
      })
    assert.equal(evidenceDecision.outcome, 'evidence_reviewed')
    const statuses = await listPortfolioEvidenceStatuses(payload, staff, Number(draft.id))
    assert.deepEqual(statuses.map(({ mediaId, status }) => ({ mediaId, status })), [{
      mediaId: staged.id, status: 'evidence_reviewed',
    }])
    await assert.rejects(recordPortfolioEvidenceReview(payload, {
      id: managerId, role: 'location_admin',
    }, Number(draft.id), staged.id, {
      outcome: 'needs_evidence', note: 'Not authorized',
    }), PortfolioEvidenceConflict)
    await assert.rejects(payload.db.drizzle.execute(sql`
      DELETE FROM portfolio_media_evidence_events WHERE id = ${evidenceDecision.id}
    `))
    await recordPortfolioEvidenceReview(payload, staff, Number(draft.id), staged.id, {
      outcome: 'needs_evidence', note: 'Request further consent verification',
    })
    const updatedStatuses = await listPortfolioEvidenceStatuses(payload, staff, Number(draft.id))
    assert.equal(updatedStatuses[0]?.status, 'needs_evidence')
    await assert.rejects(signoffPortfolioReview(payload, staff, Number(draft.id), {
      outcome: 'review_complete', note: 'All evidence checks done',
    }), PortfolioSignoffConflict)
    const returned = await signoffPortfolioReview(payload, staff, Number(draft.id), {
      outcome: 'returned_for_evidence', note: 'Need updated consent confirmation',
    })
    assert.equal(returned.outcome, 'returned_for_evidence')
    const returnedStatus = await getPortfolioSignoffStatus(payload, staff, Number(draft.id))
    assert.equal(returnedStatus?.outcome, 'returned_for_evidence')
    await recordPortfolioEvidenceReview(payload, staff, Number(draft.id), staged.id, {
      outcome: 'evidence_reviewed', note: 'Reviewed updated supporting records',
      rightsReference: 'rights:ci-updated', consentReference: 'consent:ci-updated',
    })
    const finished = await signoffPortfolioReview(payload, staff, Number(draft.id), {
      outcome: 'review_complete', note: 'Document reviews are complete for all photographs',
    })
    assert.equal(finished.outcome, 'review_complete')
    const finalizedStatus = await getPortfolioSignoffStatus(payload, staff, Number(draft.id))
    assert.equal(finalizedStatus?.outcome, 'review_complete')
    await assert.rejects(signoffPortfolioReview(payload, staff, Number(draft.id), {
      outcome: 'review_complete', note: 'Attempt to finalize twice',
    }), PortfolioSignoffConflict)
    await assert.rejects(recordPortfolioEvidenceReview(payload, staff,
      Number(draft.id), staged.id, {
        outcome: 'needs_evidence', note: 'Attempt change after final decision',
      }), PortfolioEvidenceConflict)
    const prepared = await preparePrivatePortfolioCandidates(payload, staff,
      Number(draft.id), 'Prepare private candidates only after documentation signoff')
    assert.deepEqual(prepared, { revisionId: Number(draft.id), preparedCount: 1 })
    const candidates = await listPrivatePortfolioCandidates(
      payload, staff, Number(draft.id))
    assert.deepEqual(candidates.map(({ mediaId, status }) => ({ mediaId, status })),
      [{ mediaId: staged.id, status: 'prepared' }])
    await assert.rejects(preparePrivatePortfolioCandidates(payload, staff,
      Number(draft.id), 'Second candidate preparation attempt'), PortfolioCandidateConflict)
    const candidateId = candidates[0]!.id
    await assert.rejects(payload.db.drizzle.execute(sql`
      UPDATE barber_portfolio_publication_candidates
      SET public_enabled = TRUE WHERE id = ${candidateId}
    `))
    const afterPublicAttempt = await payload.db.drizzle.execute(sql`
      SELECT public_enabled FROM barber_portfolio_publication_candidates
      WHERE id = ${candidateId}
    `)
    assert.equal(afterPublicAttempt.rows[0]?.public_enabled, false)
    // Emergency media withdrawal remains available after the barber moves.
    const transferredLocation = add('locations', await payload.create({
      collection: 'locations', overrideAccess: true,
      data: {
        name: 'Portfolio transfer CI', city: 'Test', address: 'CI avenue',
        slug: `portfolio-transfer-${suffix}`, isActive: true,
        timeZone: 'Europe/Kyiv', cancellationDeadlineMinutes: 60,
      },
    }))
    await payload.update({ collection: 'barbers', id: barber.id,
      overrideAccess: true, data: { location: Number(transferredLocation.id) } })
    const held = await placePrecautionaryPortfolioHold(payload, staff,
      Number(draft.id), staged.id, {
        kind: 'consent_concern', caseReference: 'case:ci-2026',
        reason: 'A precautionary consent concern requires immediate withdrawal',
      })
    assert.equal(held.withdrawnCandidates, 1)
    assert.deepEqual(await listPrecautionaryPortfolioHolds(payload, staff,
      Number(draft.id)), [staged.id])
    await payload.update({ collection: 'barbers', id: barber.id,
      overrideAccess: true, data: { location: Number(location.id) } })
    const triaged = await recordPortfolioHoldCaseEvent(payload, staff,
      held.holdId, {
        stage: 'investigating', assignedAdminId: Number(network.id),
        note: 'Investigate reported consent uncertainty without claimant PII',
      })
    assert.equal(triaged.stage, 'investigating')
    await assert.rejects(recordPortfolioHoldCaseEvent(payload, staff, held.holdId, {
      stage: 'closed_administratively', assignedAdminId: Number(barberUser.id),
      note: 'Not a current network administrator',
    }), HoldCaseConflict)
    const investigated = await listPortfolioHoldCases(payload, staff, Number(draft.id))
    assert.equal(investigated[0]?.stage, 'investigating')
    assert.equal(investigated[0]?.assignedAdminId, Number(network.id))
    const closedCase = await recordPortfolioHoldCaseEvent(payload, staff,
      held.holdId, {
        stage: 'closed_administratively', assignedAdminId: Number(network.id),
        note: 'Administrative review complete but media remains permanently held',
      })
    assert.equal(closedCase.stage, 'closed_administratively')
    const closedQueue = await loadPortfolioHoldQueue(payload, staff, {
      stage: 'closed_administratively', location: String(location.id),
      assignee: String(network.id),
    })
    assert.equal(closedQueue.rows.filter(r => r.holdId === held.holdId).length, 1)
    assert.equal(closedQueue.rows.find(r => r.holdId === held.holdId)?.revisionId,
      Number(draft.id))
    const openQueue = await loadPortfolioHoldQueue(payload, staff, { stage: 'open' })
    assert.equal(openQueue.rows.some(r => r.holdId === held.holdId), false)
    const unmatchedLocation = await loadPortfolioHoldQueue(payload, staff, {
      location: String(transferredLocation.id), stage: 'closed_administratively',
    })
    assert.equal(unmatchedLocation.rows.some(r => r.holdId === held.holdId), false)
    const revokedManagerQueue = await loadPortfolioHoldQueue(payload, {
      id: managerId, role: 'location_admin',
    }, { stage: 'closed_administratively' })
    assert.equal(revokedManagerQueue.rows.length, 0)

    await assert.rejects(recordPortfolioHoldCaseEvent(payload, staff, held.holdId, {
      stage: 'investigating', assignedAdminId: Number(network.id),
      note: 'Attempt reopening a closed case',
    }), HoldCaseConflict)
    await assert.rejects(payload.db.drizzle.execute(sql`
      DELETE FROM portfolio_hold_case_events WHERE hold_id = ${held.holdId}
    `))
    assert.equal((await listPrecautionaryPortfolioHolds(payload, staff,
      Number(draft.id))).length, 1)
    const withdrawn = await listPrivatePortfolioCandidates(payload, staff, Number(draft.id))
    assert.equal(withdrawn[0]?.status, 'withdrawn')
    await assert.rejects(placePrecautionaryPortfolioHold(payload, staff,
      Number(draft.id), staged.id, {
        kind: 'consent_concern', caseReference: 'case:ci-2026',
        reason: 'Repeated concern',
      }), PortfolioHoldConflict)
    await assert.rejects(withdrawPrivatePortfolioCandidate(payload, staff,
      candidateId, 'Repeat withdrawal attempt'), PortfolioCandidateConflict)
    await assert.rejects(preparePrivatePortfolioCandidates(payload, staff,
      Number(draft.id), 'Attempt preparation after precautionary hold'),
      PortfolioCandidateConflict)
    await assert.rejects(payload.db.drizzle.execute(sql`
      DELETE FROM barber_portfolio_candidate_events WHERE candidate_id = ${candidateId}
    `))
    const remainsNotPublished = await payload.findByID({
      collection: 'barber-profile-revisions', id: draft.id,
      overrideAccess: true, depth: 0,
    })
    assert.equal(remainsNotPublished.status, 'pending')
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
      // Isolated CI teardown must clear the append-only fixture through a
      // temporarily disabled fixture-only trigger, never in application code.
      await payload.db.drizzle.transaction(async tx => {
        await tx.execute(sql`ALTER TABLE portfolio_hold_case_events DISABLE TRIGGER portfolio_hold_case_events_immutable`)
        await tx.execute(sql`ALTER TABLE portfolio_media_precautionary_holds DISABLE TRIGGER portfolio_hold_immutable`)
        await tx.execute(sql`ALTER TABLE barber_portfolio_candidate_events DISABLE TRIGGER portfolio_candidate_event_immutable`)
        await tx.execute(sql`ALTER TABLE barber_portfolio_publication_candidates DISABLE TRIGGER portfolio_candidate_no_delete`)
        await tx.execute(sql`ALTER TABLE portfolio_media_evidence_events DISABLE TRIGGER portfolio_evidence_immutable`)
        await tx.execute(sql`ALTER TABLE portfolio_review_signoff_events DISABLE TRIGGER portfolio_signoff_immutable`)
        try {
          await tx.execute(sql`DELETE FROM portfolio_hold_case_events
            WHERE hold_id IN (SELECT id FROM portfolio_media_precautionary_holds WHERE media_id = ${stagedImageId})`)
          await tx.execute(sql`DELETE FROM portfolio_media_precautionary_holds
            WHERE media_id = ${stagedImageId}`)
          await tx.execute(sql`DELETE FROM barber_portfolio_candidate_events
            WHERE candidate_id IN (SELECT id FROM barber_portfolio_publication_candidates WHERE media_id = ${stagedImageId})`)
          await tx.execute(sql`DELETE FROM barber_portfolio_publication_candidates
            WHERE media_id = ${stagedImageId}`)
          await tx.execute(sql`DELETE FROM portfolio_review_signoff_events
            WHERE revision_id = (SELECT revision_id FROM private_barber_portfolio_media WHERE id = ${stagedImageId})`)
          await tx.execute(sql`DELETE FROM portfolio_media_evidence_events
            WHERE media_id = ${stagedImageId}`)
        } finally {
          await tx.execute(sql`ALTER TABLE portfolio_hold_case_events ENABLE TRIGGER portfolio_hold_case_events_immutable`)
          await tx.execute(sql`ALTER TABLE portfolio_media_precautionary_holds ENABLE TRIGGER portfolio_hold_immutable`)
          await tx.execute(sql`ALTER TABLE barber_portfolio_publication_candidates ENABLE TRIGGER portfolio_candidate_no_delete`)
          await tx.execute(sql`ALTER TABLE barber_portfolio_candidate_events ENABLE TRIGGER portfolio_candidate_event_immutable`)
          await tx.execute(sql`ALTER TABLE portfolio_review_signoff_events ENABLE TRIGGER portfolio_signoff_immutable`)
          await tx.execute(sql`ALTER TABLE portfolio_media_evidence_events ENABLE TRIGGER portfolio_evidence_immutable`)
        }
      })
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
