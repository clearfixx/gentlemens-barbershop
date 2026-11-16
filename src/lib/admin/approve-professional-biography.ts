import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { ProfessionalReviewConflictError } from './professional-approval-policy.ts'
import { biographyRevision, validateBiographyProposal } from './professional-biography-revision.ts'

function positiveId(value: unknown): number {
  const n = typeof value === 'number' ? value :
    typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid professional review identity')
  return n
}

/** First deliberately narrow professional publishing operation: BIO ONLY.
 * Lock the request and barber while resolving live author binding, base hash,
 * snapshot and approved fields. The biography write and decision are one
 * PostgreSQL transaction; any failure rolls both back. Other professional
 * fields remain inaccessible until separately validated and integrated.
 */
export async function approveProfessionalBiography(
  payload: Pick<Payload, 'db'>,
  requestId: number,
  actor: { id: number; role: string },
): Promise<{ id: number; status: 'approved'; appliedRevision: string }> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0 ||
      !Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.role !== 'admin') {
    throw new Error('Professional review decision forbidden')
  }
  return payload.db.drizzle.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT r.id, r.author_id, r.barber_id, r.location_id,
        r.status::text AS status, r.base_revision, r.snapshot, r.changes,
        b.user_id AS barber_user_id, b.location_id AS barber_location_id,
        b.bio AS published_bio
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${requestId}
      FOR UPDATE OF r, b
    `)
    if (found.rows.length !== 1) throw new ProfessionalReviewConflictError('Proposal unavailable')
    const row = found.rows[0]
    if (row.status !== 'pending') {
      throw new ProfessionalReviewConflictError('Proposal is no longer pending')
    }
    const authorId = positiveId(row.author_id)
    const barberId = positiveId(row.barber_id)
    const locationId = positiveId(row.location_id)
    if (authorId === actor.id) throw new Error('Professional proposal self-approval prohibited')
    if (positiveId(row.barber_user_id) !== authorId ||
        positiveId(row.barber_location_id) !== locationId) {
      throw new ProfessionalReviewConflictError('Barber owner or location changed')
    }
    const { previous, proposed } = validateBiographyProposal(row.snapshot, row.changes)
    const current = row.published_bio === null ? null : row.published_bio
    if (typeof current !== 'string' && current !== null) {
      throw new ProfessionalReviewConflictError('Published biography is invalid')
    }
    if (previous !== current ||
        biographyRevision({
          barberId, locationId, authorId, bio: current,
        }) !== row.base_revision) {
      throw new ProfessionalReviewConflictError('Published biography revision changed')
    }
    const nextRevision = biographyRevision({
      barberId, locationId, authorId, bio: proposed,
    })

    // Revalidate the administrator against the current DB identity before
    // mutating published content. This also prevents stale role sessions.
    const updated = await tx.execute(sql`
      UPDATE barbers
      SET bio = ${proposed}, updated_at = NOW()
      WHERE id = ${barberId} AND user_id = ${authorId}
        AND location_id = ${locationId}
        AND bio IS NOT DISTINCT FROM ${current}
        AND EXISTS (
          SELECT 1 FROM users WHERE id = ${actor.id}
          AND role = 'admin'::public.enum_users_role
        )
      RETURNING id
    `)
    if (updated.rows.length !== 1) {
      throw new ProfessionalReviewConflictError('Professional publication conflict')
    }
    const decided = await tx.execute(sql`
      UPDATE barber_profile_revisions
      SET status = 'approved'::public.enum_barber_profile_revisions_status,
        reviewer_id = ${actor.id}, reviewed_at = NOW(),
        applied_revision = ${nextRevision}, updated_at = NOW()
      WHERE id = ${requestId}
        AND status = 'pending'::public.enum_barber_profile_revisions_status
      RETURNING id
    `)
    if (decided.rows.length !== 1) {
      throw new ProfessionalReviewConflictError('Professional review decision conflict')
    }
    return { id: requestId, status: 'approved' as const, appliedRevision: nextRevision }
  })
}
