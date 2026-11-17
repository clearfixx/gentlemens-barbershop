import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

export type PortfolioHoldKind = 'consent_concern' | 'rights_concern' | 'safety_concern'
export class PortfolioHoldConflict extends Error {
  constructor(message = 'Media hold unavailable or already recorded') {
    super(message)
    this.name = 'PortfolioHoldConflict'
  }
}

export function parsePrecautionaryHold(input: unknown): {
  kind: PortfolioHoldKind; caseReference: string; reason: string
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RangeError('Invalid precautionary hold request')
  }
  const raw = input as Record<string, unknown>
  if (Object.keys(raw).length !== 3 ||
      !['kind', 'caseReference', 'reason'].every(k => Object.hasOwn(raw, k)) ||
      !['consent_concern', 'rights_concern', 'safety_concern'].includes(String(raw.kind)) ||
      typeof raw.caseReference !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_:/.-]{3,255}$/.test(raw.caseReference) ||
      raw.caseReference.includes('://') || raw.caseReference.includes('..') ||
      typeof raw.reason !== 'string' || raw.reason.trim().length < 5 ||
      raw.reason.trim().length > 1000) {
    throw new RangeError('Invalid precautionary hold details')
  }
  return {
    kind: raw.kind as PortfolioHoldKind,
    caseReference: raw.caseReference,
    reason: raw.reason.trim(),
  }
}

/** Lock the revision BEFORE candidate operations: preparation and hold
 * serialize on the same row. A claim may be unverified; it immediately
 * prevents candidate preparation and withdraws an existing private candidate.
 * This does not establish the claimant's identity or decide legal merit.
 */
export async function placePrecautionaryPortfolioHold(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  mediaId: number,
  input: unknown,
): Promise<{ holdId: number; revisionId: number; mediaId: number; withdrawnCandidates: number }> {
  if (actor.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !Number.isSafeInteger(mediaId) || mediaId <= 0) {
    throw new PortfolioHoldConflict()
  }
  const hold = parsePrecautionaryHold(input)
  return payload.db.drizzle.transaction(async tx => {
    const review = await tx.execute(sql`
      SELECT r.id FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${revisionId}
      FOR UPDATE OF r, b
    `)
    if (review.rows.length !== 1) throw new PortfolioHoldConflict()
    const media = await tx.execute(sql`
      SELECT m.id FROM private_barber_portfolio_media m
      JOIN barber_profile_revisions r ON r.id = m.revision_id
      WHERE m.id = ${mediaId} AND r.id = ${revisionId}
        AND m.barber_id = r.barber_id AND m.location_id = r.location_id
        AND m.uploaded_by_id = r.author_id
      FOR UPDATE OF m
    `)
    if (media.rows.length !== 1) throw new PortfolioHoldConflict()
    const allowed = await tx.execute(sql`
      SELECT id FROM users WHERE id = ${actor.id}
        AND role = 'admin'::public.enum_users_role FOR SHARE
    `)
    if (allowed.rows.length !== 1) throw new PortfolioHoldConflict()

    const inserted = await tx.execute(sql`
      INSERT INTO portfolio_media_precautionary_holds
        (revision_id, media_id, actor_id, kind, case_reference, reason)
      VALUES (${revisionId}, ${mediaId}, ${actor.id},
        ${hold.kind}::public.enum_portfolio_media_hold_kind,
        ${hold.caseReference}, ${hold.reason})
      ON CONFLICT (media_id) DO NOTHING RETURNING id
    `)
    if (inserted.rows.length !== 1) throw new PortfolioHoldConflict('Already on precautionary hold')

    const withdrawn = await tx.execute(sql`
      UPDATE barber_portfolio_publication_candidates
      SET status = 'withdrawn'::public.enum_portfolio_candidate_status,
        withdrawn_at = NOW()
      WHERE revision_id = ${revisionId} AND media_id = ${mediaId}
        AND status = 'prepared'::public.enum_portfolio_candidate_status
        AND public_enabled = FALSE
      RETURNING id
    `)
    if (withdrawn.rows.length > 1) throw new PortfolioHoldConflict('Unexpected duplicate candidates')
    for (const candidate of withdrawn.rows) {
      const event = await tx.execute(sql`
        INSERT INTO barber_portfolio_candidate_events
          (candidate_id, actor_id, event, reason)
        VALUES (${Number(candidate.id)}, ${actor.id}, 'withdrawn',
          ${'Precautionary hold: ' + hold.kind + ' / ' + hold.caseReference})
        RETURNING id
      `)
      if (event.rows.length !== 1) throw new PortfolioHoldConflict('Missing candidate withdrawal audit')
    }
    return {
      holdId: Number(inserted.rows[0].id), revisionId, mediaId,
      withdrawnCandidates: withdrawn.rows.length,
    }
  })
}

export async function listPrecautionaryPortfolioHolds(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<number[]> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0) {
    throw new RangeError('Invalid hold query')
  }
  const access = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users WHERE id = ${actor.id}
        AND role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (SELECT 1 FROM users u
        JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id} AND u.role = 'location_admin'::public.enum_users_role
          AND a.location_id = r.location_id AND a.is_active = TRUE)`
  const rows = await payload.db.drizzle.execute(sql`
    SELECT h.media_id FROM portfolio_media_precautionary_holds h
    JOIN barber_profile_revisions r ON r.id = h.revision_id
    WHERE r.id = ${revisionId} AND ${access}
    ORDER BY h.media_id LIMIT 31
  `)
  if (rows.rows.length > 30) throw new Error('Unexpected hold count')
  return rows.rows.map(row => Number(row.media_id))
}
