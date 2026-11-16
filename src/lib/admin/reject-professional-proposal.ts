import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { ProfessionalReviewConflictError } from './professional-approval-policy.ts'

/** Reject a submitted professional proposal without touching published
 * barber data. Approval intentionally has no endpoint until transactional
 * publication, validation of media, and revision audit are implemented.
 */
export async function rejectProfessionalProposal(
  payload: Pick<Payload, 'db'>,
  requestId: number,
  actor: { id: number; role: string },
  reason: string,
): Promise<{ id: number; status: 'rejected' }> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0 ||
      !Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.role !== 'admin') {
    throw new Error('Professional review decision forbidden')
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmed || trimmed.length > 1000) {
    throw new RangeError('Professional rejection reason required')
  }
  return payload.db.drizzle.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT r.id, r.author_id, r.status::text AS status,
        r.location_id, r.barber_id,
        b.location_id AS current_barber_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${requestId}
      FOR UPDATE OF r, b
    `)
    if (found.rows.length !== 1) throw new ProfessionalReviewConflictError('Proposal unavailable')
    const row = found.rows[0]
    if (Number(row.author_id) === actor.id) {
      throw new Error('Professional proposal self-approval prohibited')
    }
    if (row.status !== 'pending') {
      throw new ProfessionalReviewConflictError('Proposal is no longer pending')
    }
    if (Number(row.location_id) !== Number(row.current_barber_location_id)) {
      throw new ProfessionalReviewConflictError('Barber location changed')
    }
    // The session must still map to a network admin at decision time.
    const changed = await tx.execute(sql`
      UPDATE barber_profile_revisions
      SET status = 'rejected'::public.enum_barber_profile_revisions_status,
        reviewer_id = ${actor.id}, reviewed_at = NOW(),
        rejection_reason = ${trimmed}, updated_at = NOW()
      WHERE id = ${requestId}
        AND status = 'pending'::public.enum_barber_profile_revisions_status
        AND EXISTS (
          SELECT 1 FROM users WHERE id = ${actor.id}
          AND role = 'admin'::public.enum_users_role
        )
      RETURNING id
    `)
    if (changed.rows.length !== 1) {
      throw new ProfessionalReviewConflictError('Professional review decision conflict')
    }
    return { id: requestId, status: 'rejected' as const }
  })
}
