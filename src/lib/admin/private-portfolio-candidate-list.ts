import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** Minimal internal projection. Current branch assignments and network roles
 * are checked in SQL, not inferred from a prior page authorization.
 */
export async function listPrivatePortfolioCandidates(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<Array<{ id: number; mediaId: number; status: 'prepared' | 'withdrawn' }>> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !['admin', 'location_admin'].includes(actor.role)) {
    throw new RangeError('Invalid portfolio candidate query')
  }
  const permission = actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
        AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (SELECT 1 FROM users u
        JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id}
          AND u.role = 'location_admin'::public.enum_users_role
          AND a.location_id = r.location_id AND a.is_active = TRUE)`
  const result = await payload.db.drizzle.execute(sql`
    SELECT c.id, c.media_id, c.status::text AS status
    FROM barber_portfolio_publication_candidates c
    JOIN barber_profile_revisions r ON r.id = c.revision_id
    JOIN barbers b ON b.id = r.barber_id
    WHERE r.id = ${revisionId}
      AND c.manifest_sha256 = r.submitted_manifest_hash
      AND c.barber_id = r.barber_id AND c.location_id = r.location_id
      AND b.user_id = r.author_id AND b.location_id = r.location_id
      AND c.public_enabled = FALSE
      AND ${permission}
    ORDER BY c.sort_order ASC, c.id ASC LIMIT 31
  `)
  if (result.rows.length > 30) throw new Error('Private portfolio candidates exceed technical limit')
  return result.rows.map(row => {
    const id = Number(row.id), mediaId = Number(row.media_id)
    if (!Number.isSafeInteger(id) || id <= 0 ||
        !Number.isSafeInteger(mediaId) || mediaId <= 0 ||
        (row.status !== 'prepared' && row.status !== 'withdrawn')) {
      throw new Error('Invalid private portfolio candidate result')
    }
    return { id, mediaId, status: row.status }
  })
}
