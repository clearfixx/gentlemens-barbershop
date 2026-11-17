import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { validatePortfolioSubmission } from './submit-private-portfolio-draft.ts'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'

export type EvidenceOutcome = 'needs_evidence' | 'evidence_reviewed' | 'rejected'
export type EvidenceDecision = {
  outcome: EvidenceOutcome
  note: string
  rightsReference?: string
  consentReference?: string
}

export class PortfolioEvidenceConflict extends Error {
  constructor(message = 'Portfolio evidence review unavailable') {
    super(message)
    this.name = 'PortfolioEvidenceConflict'
  }
}

/** Opaque document identifiers only; do not store personal information,
 * URLs, names, or customer consent documents in the review-event table.
 */
function reference(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_:/.-]{3,255}$/.test(value) ||
      value.includes('..') || value.includes('://')) {
    throw new RangeError('Invalid evidence reference')
  }
  return value
}

export function parsePortfolioEvidenceDecision(input: unknown): {
  outcome: EvidenceOutcome
  note: string
  rightsReference: string | null
  consentReference: string | null
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RangeError('Invalid portfolio evidence decision')
  }
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(key =>
      !['outcome', 'note', 'rightsReference', 'consentReference'].includes(key)) ||
      !['needs_evidence', 'evidence_reviewed', 'rejected'].includes(String(body.outcome)) ||
      typeof body.note !== 'string' || !body.note.trim() || body.note.trim().length > 1000) {
    throw new RangeError('Invalid portfolio evidence decision')
  }
  const rightsReference = reference(body.rightsReference)
  const consentReference = reference(body.consentReference)
  if (body.outcome === 'evidence_reviewed' && (!rightsReference || !consentReference)) {
    throw new RangeError('Evidence review requires both rights and consent document references')
  }
  return {
    outcome: body.outcome as EvidenceOutcome,
    note: body.note.trim(), rightsReference, consentReference,
  }
}

/** A review EVENT, not a publication approval. DB locks the same revision as
 * submission and staging. Every media byte is rehashed before attestation.
 * Only network admins may record the evidence decision in v1.
 */
export async function recordPortfolioEvidenceReview(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  mediaId: number,
  decision: EvidenceDecision,
): Promise<{ id: number; revisionId: number; mediaId: number; outcome: EvidenceOutcome }> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.role !== 'admin' ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !Number.isSafeInteger(mediaId) || mediaId <= 0) {
    throw new PortfolioEvidenceConflict()
  }
  const parsed = parsePortfolioEvidenceDecision(decision)
  return payload.db.drizzle.transaction(async tx => {
    const records = await tx.execute(sql`
      SELECT r.id, r.barber_id, r.location_id, r.author_id, r.status::text AS status,
        r.changes, r.submitted_manifest_hash,
        b.user_id AS barber_user_id, b.location_id AS barber_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${revisionId}
      FOR UPDATE OF r, b
    `)
    if (records.rows.length !== 1) throw new PortfolioEvidenceConflict()
    const record = records.rows[0]
    if (record.status !== 'pending' ||
        Number(record.barber_user_id) !== Number(record.author_id) ||
        Number(record.barber_location_id) !== Number(record.location_id) ||
        !/^[0-9a-f]{64}$/.test(String(record.submitted_manifest_hash))) {
      throw new PortfolioEvidenceConflict()
    }
    let items: ReturnType<typeof validatePortfolioSubmission>
    try {
      if (!record.changes || typeof record.changes !== 'object' ||
          Array.isArray(record.changes) || Object.keys(record.changes).length !== 1 ||
          !Object.hasOwn(record.changes, 'portfolio')) throw new Error('Not a portfolio')
      items = validatePortfolioSubmission(
        (record.changes as Record<string, unknown>).portfolio)
    } catch {
      throw new PortfolioEvidenceConflict('Invalid submitted portfolio')
    }
    if (!items.some(item => item.mediaId === mediaId)) throw new PortfolioEvidenceConflict()
    // Once documentation review was finalized, evidence history is sealed.
    // A returned-for-evidence signoff remains actionable for corrections.
    const final = await tx.execute(sql`
      SELECT 1 FROM portfolio_review_signoff_events
      WHERE revision_id = ${revisionId}
        AND outcome = 'review_complete'::public.enum_portfolio_review_signoff_outcome
      LIMIT 1
    `)
    if (final.rows.length) throw new PortfolioEvidenceConflict('Evidence review already finalized')
    const photos = await tx.execute(sql`
      SELECT id, barber_id, location_id, uploaded_by_id,
        mime_type, size_bytes, sha256, content
      FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
      ORDER BY id FOR SHARE
    `)
    if (photos.rows.length !== items.length) throw new PortfolioEvidenceConflict()
    const custody: Array<{ id: number; mime: string; size: number; sha: string }> = []
    for (const photo of photos.rows) {
      const bytes = photo.content instanceof Uint8Array ? photo.content :
        typeof photo.content === 'string' && photo.content.startsWith('\\x')
          ? Buffer.from(photo.content.slice(2), 'hex') : null
      const size = Number(photo.size_bytes)
      const sha = String(photo.sha256)
      if (!bytes || bytes.length !== size ||
          createHash('sha256').update(bytes).digest('hex') !== sha ||
          Number(photo.barber_id) !== Number(record.barber_id) ||
          Number(photo.location_id) !== Number(record.location_id) ||
          Number(photo.uploaded_by_id) !== Number(record.author_id)) {
        throw new PortfolioEvidenceConflict('Portfolio media integrity changed')
      }
      custody.push({ id: Number(photo.id), mime: String(photo.mime_type), size, sha })
    }
    let fingerprint: string
    try {
      fingerprint = computeSubmittedPortfolioManifest({
        barberId: Number(record.barber_id), locationId: Number(record.location_id),
        authorId: Number(record.author_id),
      }, items, custody)
    } catch {
      throw new PortfolioEvidenceConflict('Portfolio custody set changed')
    }
    if (fingerprint !== record.submitted_manifest_hash) {
      throw new PortfolioEvidenceConflict('Portfolio manifest changed')
    }
    const inserted = await tx.execute(sql`
      INSERT INTO portfolio_media_evidence_events
        (revision_id, media_id, reviewer_id, submitted_manifest_hash,
         rights_reference, consent_reference, outcome, reviewer_note)
      SELECT ${revisionId}, ${mediaId}, ${actor.id}, ${fingerprint},
        ${parsed.rightsReference}, ${parsed.consentReference},
        ${parsed.outcome}::public.enum_portfolio_evidence_review_outcome,
        ${parsed.note}
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${actor.id}
        AND role = 'admin'::public.enum_users_role)
      RETURNING id
    `)
    if (inserted.rows.length !== 1) throw new PortfolioEvidenceConflict()
    return {
      id: Number(inserted.rows[0].id), revisionId, mediaId,
      outcome: parsed.outcome,
    }
  })
}
