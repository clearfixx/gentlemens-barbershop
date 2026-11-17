import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** Read-only status of the latest review event for each image. No sensitive
 * rights/consent document refs, reviewer notes or customer data returned.
 * Staff's current DB role/location assignment checked on EVERY read.
 */
export async function listPortfolioEvidenceStatuses(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<Array<{ mediaId: number; status: 'needs_evidence' | 'evidence_reviewed' | 'rejected'; reviewedAt: string }>> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !['admin', 'location_admin'].includes(actor.role)) {
    throw new RangeError('Invalid evidence review identity')
  }
  const allowed = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
      AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (SELECT 1 FROM users u JOIN location_assignments a ON a.user_id = u.id
      WHERE u.id = ${actor.id} AND u.role = 'location_admin'::public.enum_users_role
        AND a.location_id = r.location_id AND a.is_active = TRUE)`
  const result = await payload.db.drizzle.execute(sql`
    SELECT DISTINCT ON (e.media_id) e.media_id, e.outcome::text AS outcome,
      e.created_at::text AS reviewed_at
    FROM portfolio_media_evidence_events e
    JOIN barber_profile_revisions r ON r.id = e.revision_id
    JOIN barbers b ON b.id = r.barber_id
    JOIN private_barber_portfolio_media m ON m.id = e.media_id
    WHERE r.id = ${revisionId} AND e.revision_id = r.id
      AND m.revision_id = r.id
      AND e.submitted_manifest_hash = r.submitted_manifest_hash
      AND b.user_id = r.author_id AND b.location_id = r.location_id
      AND r.status IN ('pending'::public.enum_barber_profile_revisions_status,
        'approved'::public.enum_barber_profile_revisions_status,
        'rejected'::public.enum_barber_profile_revisions_status)
      AND ${allowed}
    ORDER BY e.media_id, e.id DESC
    LIMIT 30
  `)
  return result.rows.map(row => {
    const mediaId = Number(row.media_id)
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0 ||
        !['needs_evidence', 'evidence_reviewed', 'rejected'].includes(String(row.outcome))) {
      throw new Error('Invalid portfolio evidence event')
    }
    return {
      mediaId,
      status: row.outcome as 'needs_evidence' | 'evidence_reviewed' | 'rejected',
      reviewedAt: String(row.reviewed_at),
    }
  })
}
