import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import { validatePortfolioSubmission } from './submit-private-portfolio-draft.ts'

export type PortfolioSignoffOutcome = 'review_complete' | 'returned_for_evidence'
export class PortfolioSignoffConflict extends Error {
  constructor(message = 'Portfolio review signoff unavailable') {
    super(message)
    this.name = 'PortfolioSignoffConflict'
  }
}
export function parsePortfolioSignoff(body: unknown): { outcome: PortfolioSignoffOutcome; note: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 2) throw new RangeError('Invalid portfolio signoff')
  const input = body as Record<string, unknown>
  if ((input.outcome !== 'review_complete' && input.outcome !== 'returned_for_evidence') ||
      typeof input.note !== 'string' || input.note.trim().length < 5 ||
      input.note.trim().length > 1000) throw new RangeError('Portfolio review requires a reason')
  return { outcome: input.outcome, note: input.note.trim() }
}

/** Final ADMINISTRATIVE documentation signoff, never public publication.
 * Own transaction locks the revision to serialize evidence events and competing
 * signoffs. Rehashes all bytes, verifies exact manifest and latest per-photo
 * evidence before recording an immutable event.
 */
export async function signoffPortfolioReview(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  input: unknown,
): Promise<{ id: number; revisionId: number; outcome: PortfolioSignoffOutcome; imageCount: number }> {
  if (actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0) {
    throw new PortfolioSignoffConflict()
  }
  const decision = parsePortfolioSignoff(input)
  return payload.db.drizzle.transaction(async tx => {
    const rows = await tx.execute(sql`
      SELECT r.id, r.status::text AS status, r.author_id, r.location_id, r.barber_id,
        r.changes, r.submitted_manifest_hash,
        b.user_id AS current_owner_id, b.location_id AS current_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${revisionId}
      FOR UPDATE OF r, b
    `)
    if (rows.rows.length !== 1) throw new PortfolioSignoffConflict()
    const row = rows.rows[0]
    const manifestHash = row.submitted_manifest_hash
    if (row.status !== 'pending' ||
        Number(row.author_id) !== Number(row.current_owner_id) ||
        Number(row.location_id) !== Number(row.current_location_id) ||
        Number(row.author_id) === actor.id ||
        typeof manifestHash !== 'string' || !/^[0-9a-f]{64}$/.test(manifestHash)) {
      throw new PortfolioSignoffConflict('Portfolio owner, status or fingerprint changed')
    }
    let items: ReturnType<typeof validatePortfolioSubmission>
    try {
      if (!row.changes || typeof row.changes !== 'object' ||
          Array.isArray(row.changes) || Object.keys(row.changes).length !== 1 ||
          !Object.hasOwn(row.changes, 'portfolio')) throw new Error('Unsupported changes')
      items = validatePortfolioSubmission((row.changes as Record<string, unknown>).portfolio)
    } catch {
      throw new PortfolioSignoffConflict('Invalid portfolio item metadata')
    }
    const images = await tx.execute(sql`
      SELECT id, barber_id, location_id, uploaded_by_id,
        mime_type, size_bytes, sha256, content
      FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
      ORDER BY id
      FOR SHARE
    `)
    if (images.rows.length !== items.length) {
      throw new PortfolioSignoffConflict('Submitted media set changed')
    }
    const custody: Array<{ id: number; mime: string; size: number; sha: string }> = []
    for (const media of images.rows) {
      const bytes = media.content instanceof Uint8Array ? media.content :
        typeof media.content === 'string' && media.content.startsWith('\\x')
          ? Buffer.from(media.content.slice(2), 'hex') : null
      const id = Number(media.id), size = Number(media.size_bytes), sha = String(media.sha256)
      if (!bytes || !Number.isSafeInteger(id) || id <= 0 ||
          bytes.length !== size || size < 1 || size > 5242880 ||
          createHash('sha256').update(bytes).digest('hex') !== sha ||
          Number(media.barber_id) !== Number(row.barber_id) ||
          Number(media.location_id) !== Number(row.location_id) ||
          Number(media.uploaded_by_id) !== Number(row.author_id)) {
        throw new PortfolioSignoffConflict('Private media integrity mismatch')
      }
      custody.push({ id, size, sha, mime: String(media.mime_type) })
    }
    try {
      if (computeSubmittedPortfolioManifest({
        barberId: Number(row.barber_id), locationId: Number(row.location_id),
        authorId: Number(row.author_id),
      }, items, custody) !== manifestHash) throw new Error('Fingerprint changed')
    } catch {
      throw new PortfolioSignoffConflict('Portfolio manifest no longer matches')
    }
    const evidence = await tx.execute(sql`
      SELECT DISTINCT ON (e.media_id)
        e.media_id, e.outcome::text AS outcome, e.rights_reference, e.consent_reference
      FROM portfolio_media_evidence_events e
      WHERE e.revision_id = ${revisionId}
        AND e.submitted_manifest_hash = ${manifestHash}
      ORDER BY e.media_id, e.id DESC
    `)
    const allowedIds = new Set(items.map(i => i.mediaId))
    if (evidence.rows.some(event => !allowedIds.has(Number(event.media_id)))) {
      throw new PortfolioSignoffConflict('Evidence references foreign media')
    }
    if (decision.outcome === 'review_complete' &&
      (evidence.rows.length !== items.length ||
        evidence.rows.some(e => e.outcome !== 'evidence_reviewed' ||
          !e.rights_reference || !e.consent_reference))) {
      throw new PortfolioSignoffConflict('Not all photos have required evidence reviews')
    }
    const inserted = await tx.execute(sql`
      INSERT INTO portfolio_review_signoff_events
        (revision_id, reviewer_id, submitted_manifest_hash, outcome,
          reviewer_note, image_count)
      SELECT ${revisionId}, ${actor.id}, ${manifestHash},
        ${decision.outcome}::public.enum_portfolio_review_signoff_outcome,
        ${decision.note}, ${items.length}
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${actor.id}
          AND role = 'admin'::public.enum_users_role
      )
      AND NOT EXISTS (
        SELECT 1 FROM portfolio_review_signoff_events
        WHERE revision_id = ${revisionId}
          AND outcome = 'review_complete'::public.enum_portfolio_review_signoff_outcome
      )
      RETURNING id
    `)
    if (inserted.rows.length !== 1) throw new PortfolioSignoffConflict('Review was finalized or role revoked')
    return {
      id: Number(inserted.rows[0].id), revisionId,
      outcome: decision.outcome, imageCount: items.length,
    }
  })
}
