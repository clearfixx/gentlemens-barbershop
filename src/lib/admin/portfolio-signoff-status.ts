import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** Current staff scope enforced in SQL. No notes, references, personal data
 * or evidence attachments are returned to the review UI. */
export async function getPortfolioSignoffStatus(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<{ outcome: 'review_complete' | 'returned_for_evidence'; reviewedAt: string } | null> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !['admin', 'location_admin'].includes(actor.role)) {
    throw new RangeError('Invalid portfolio signoff identity')
  }
  const access = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
        AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (SELECT 1 FROM users u
        JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id}
          AND u.role = 'location_admin'::public.enum_users_role
          AND a.location_id = r.location_id AND a.is_active = TRUE)`
  const result = await payload.db.drizzle.execute(sql`
    SELECT e.outcome::text AS outcome, e.created_at::text AS reviewed_at
    FROM portfolio_review_signoff_events e
    JOIN barber_profile_revisions r ON r.id = e.revision_id
    JOIN barbers b ON b.id = r.barber_id
    WHERE e.revision_id = ${revisionId}
      AND e.submitted_manifest_hash = r.submitted_manifest_hash
      AND r.status IN (
        'pending'::public.enum_barber_profile_revisions_status,
        'approved'::public.enum_barber_profile_revisions_status,
        'rejected'::public.enum_barber_profile_revisions_status
      )
      AND b.user_id = r.author_id AND b.location_id = r.location_id
      AND ${access}
    ORDER BY e.id DESC LIMIT 1
  `)
  if (!result.rows.length) return null
  const row = result.rows[0]
  if (row.outcome !== 'review_complete' && row.outcome !== 'returned_for_evidence') {
    throw new Error('Invalid portfolio signoff status')
  }
  return { outcome: row.outcome, reviewedAt: String(row.reviewed_at) }
}
