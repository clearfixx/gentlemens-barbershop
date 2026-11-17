import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import { validatePortfolioSubmission } from './submit-private-portfolio-draft.ts'

export class PortfolioCandidateConflict extends Error {
  constructor(message = 'Private portfolio candidate operation unavailable') {
    super(message)
    this.name = 'PortfolioCandidateConflict'
  }
}

function validateActor(actor: { id: number; role: string }, revisionId: number) {
  if (actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0) throw new PortfolioCandidateConflict()
}
function parseReason(reason: unknown) {
  if (typeof reason !== 'string' || reason.trim().length < 5 ||
      reason.trim().length > 1000) throw new RangeError('An administrative reason is required')
  return reason.trim()
}

/** Create immutable NONPUBLIC candidates from a completed documentary
 * signoff. Repeat all source/rights/media checks in the same SQL transaction.
 * Does not set professional revision to approved or create public URLs.
 */
export async function preparePrivatePortfolioCandidates(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  reason: string,
): Promise<{ revisionId: number; preparedCount: number }> {
  validateActor(actor, revisionId)
  const note = parseReason(reason)
  return payload.db.drizzle.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT r.id, r.status::text AS status, r.author_id,
        r.barber_id, r.location_id, r.submitted_manifest_hash, r.changes,
        b.user_id AS owner_id, b.location_id AS current_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${revisionId}
      FOR UPDATE OF r, b
    `)
    if (found.rows.length !== 1) throw new PortfolioCandidateConflict()
    const row = found.rows[0]
    const manifest = row.submitted_manifest_hash
    if (row.status !== 'pending' || Number(row.author_id) !== Number(row.owner_id) ||
        Number(row.location_id) !== Number(row.current_location_id) ||
        Number(row.author_id) === actor.id || typeof manifest !== 'string' ||
        !/^[0-9a-f]{64}$/.test(manifest)) throw new PortfolioCandidateConflict()

    let items: ReturnType<typeof validatePortfolioSubmission>
    try {
      if (!row.changes || typeof row.changes !== 'object' ||
          Array.isArray(row.changes) || Object.keys(row.changes).length !== 1 ||
          !Object.hasOwn(row.changes, 'portfolio')) throw new Error('Unsupported content')
      items = validatePortfolioSubmission((row.changes as Record<string, unknown>).portfolio)
    } catch { throw new PortfolioCandidateConflict('Invalid candidate item metadata') }

    const previous = await tx.execute(sql`
      SELECT id FROM barber_portfolio_publication_candidates
      WHERE revision_id = ${revisionId} LIMIT 1
    `)
    if (previous.rows.length) throw new PortfolioCandidateConflict('Candidates already exist')

    const signoffs = await tx.execute(sql`
      SELECT id FROM portfolio_review_signoff_events
      WHERE revision_id = ${revisionId}
        AND submitted_manifest_hash = ${manifest}
        AND outcome = 'review_complete'::public.enum_portfolio_review_signoff_outcome
      ORDER BY id DESC LIMIT 1
    `)
    if (signoffs.rows.length !== 1) throw new PortfolioCandidateConflict('Review is not complete')
    const signoffId = Number(signoffs.rows[0].id)

    const records = await tx.execute(sql`
      SELECT id, barber_id, location_id, uploaded_by_id,
        mime_type, size_bytes, sha256, content
      FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
      ORDER BY id FOR SHARE
    `)
    if (records.rows.length !== items.length) throw new PortfolioCandidateConflict('Photo set changed')
    const custody: Array<{ id: number; mime: string; size: number; sha: string }> = []
    for (const record of records.rows) {
      const id = Number(record.id), size = Number(record.size_bytes),
        sha = String(record.sha256)
      const bytes = record.content instanceof Uint8Array ? record.content :
        typeof record.content === 'string' && record.content.startsWith('\\x')
          ? Buffer.from(record.content.slice(2), 'hex') : null
      if (!bytes || !Number.isSafeInteger(id) || id <= 0 || bytes.length !== size ||
          size < 1 || size > 5242880 ||
          createHash('sha256').update(bytes).digest('hex') !== sha ||
          Number(record.barber_id) !== Number(row.barber_id) ||
          Number(record.location_id) !== Number(row.location_id) ||
          Number(record.uploaded_by_id) !== Number(row.author_id)) {
        throw new PortfolioCandidateConflict('Private image integrity changed')
      }
      custody.push({ id, size, sha, mime: String(record.mime_type) })
    }
    try {
      if (computeSubmittedPortfolioManifest({
        barberId: Number(row.barber_id), locationId: Number(row.location_id),
        authorId: Number(row.author_id),
      }, items, custody) !== manifest) throw new Error('Manifest mismatch')
    } catch { throw new PortfolioCandidateConflict('Manifest mismatch') }

    const evidence = await tx.execute(sql`
      SELECT DISTINCT ON (media_id) media_id, outcome::text AS outcome,
        rights_reference, consent_reference
      FROM portfolio_media_evidence_events
      WHERE revision_id = ${revisionId} AND submitted_manifest_hash = ${manifest}
      ORDER BY media_id, id DESC
    `)
    const rights = new Map(evidence.rows.map(item => [Number(item.media_id), item]))
    if (rights.size !== items.length || items.some(item => {
      const decision = rights.get(item.mediaId)
      return !decision || decision.outcome !== 'evidence_reviewed' ||
        !decision.rights_reference || !decision.consent_reference
    })) throw new PortfolioCandidateConflict('Evidence review is incomplete')

    // Final check inside transaction; do not trust stale HTTP session roles.
    const admin = await tx.execute(sql`
      SELECT id FROM users WHERE id = ${actor.id}
        AND role = 'admin'::public.enum_users_role FOR SHARE
    `)
    if (admin.rows.length !== 1) throw new PortfolioCandidateConflict('Administrator role revoked')

    for (const item of items) {
      const source = custody.find(c => c.id === item.mediaId)!
      const saved = await tx.execute(sql`
        INSERT INTO barber_portfolio_publication_candidates
          (revision_id, media_id, barber_id, location_id, prepared_by_id,
            signoff_id, manifest_sha256, media_sha256,
            alt_text, caption, sort_order)
        VALUES (${revisionId}, ${item.mediaId},
          ${Number(row.barber_id)}, ${Number(row.location_id)},
          ${actor.id}, ${signoffId}, ${manifest}, ${source.sha},
          ${item.alt}, ${item.caption ?? null}, ${item.sortOrder})
        RETURNING id
      `)
      if (saved.rows.length !== 1) throw new PortfolioCandidateConflict('Candidate insert failed')
      const candidateId = Number(saved.rows[0].id)
      const audit = await tx.execute(sql`
        INSERT INTO barber_portfolio_candidate_events (candidate_id, actor_id, event, reason)
        VALUES (${candidateId}, ${actor.id}, 'prepared', ${note})
        RETURNING id
      `)
      if (audit.rows.length !== 1) throw new PortfolioCandidateConflict('Candidate audit failed')
    }
    return { revisionId, preparedCount: items.length }
  })
}

/** Immediate fail-closed withdrawal. A candidate is NEVER publicly enabled.
 * Network administrator only; identity/role is rechecked at decision time.
 * Support for client-initiated consent withdrawal needs a verified claimant
 * workflow, not an untrusted user-supplied consent reference.
 */
export async function withdrawPrivatePortfolioCandidate(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  candidateId: number,
  reason: string,
): Promise<{ id: number; status: 'withdrawn' }> {
  if (actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(candidateId) || candidateId <= 0) {
    throw new PortfolioCandidateConflict()
  }
  const note = parseReason(reason)
  return payload.db.drizzle.transaction(async tx => {
    const updated = await tx.execute(sql`
      UPDATE barber_portfolio_publication_candidates
      SET status = 'withdrawn'::public.enum_portfolio_candidate_status,
        withdrawn_at = NOW()
      WHERE id = ${candidateId}
        AND status = 'prepared'::public.enum_portfolio_candidate_status
        AND public_enabled = FALSE
        AND EXISTS (
          SELECT 1 FROM users WHERE id = ${actor.id}
          AND role = 'admin'::public.enum_users_role
        )
      RETURNING id
    `)
    if (updated.rows.length !== 1) throw new PortfolioCandidateConflict('Candidate already withdrawn or access revoked')
    const audit = await tx.execute(sql`
      INSERT INTO barber_portfolio_candidate_events (candidate_id, actor_id, event, reason)
      VALUES (${candidateId}, ${actor.id}, 'withdrawn', ${note})
      RETURNING id
    `)
    if (audit.rows.length !== 1) throw new PortfolioCandidateConflict('Withdrawal audit failed')
    return { id: candidateId, status: 'withdrawn' as const }
  })
}
