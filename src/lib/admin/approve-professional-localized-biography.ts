import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { ProfessionalReviewConflictError } from './professional-approval-policy.ts'
import {
  localizedBiographyRevision,
  validateLocalizedBiographyProposal,
} from './professional-localized-biography.ts'

function positiveId(value: unknown): number {
  const n = typeof value === 'number' ? value :
    typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ProfessionalReviewConflictError('Invalid professional identity')
  }
  return n
}

/** Atomically publish ONE verified locale from a submitted revision.
 * A barber row lock serializes competing localized proposals, including
 * proposals for a previously absent translation. Other locales are untouched.
 */
export async function approveProfessionalLocalizedBiography(
  payload: Pick<Payload, 'db'>,
  requestId: number,
  actor: { id: number; role: string },
): Promise<{
  id: number
  status: 'approved'
  locale: 'uk' | 'en'
  appliedRevision: string
}> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0 ||
      !Number.isSafeInteger(actor.id) || actor.id <= 0 || actor.role !== 'admin') {
    throw new Error('Professional review decision forbidden')
  }
  return payload.db.drizzle.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT r.id, r.author_id, r.barber_id, r.location_id,
        r.status::text AS status, r.base_revision, r.snapshot, r.changes,
        b.user_id AS barber_user_id, b.location_id AS barber_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      JOIN users author ON author.id = r.author_id
        AND author.role = 'barber'::public.enum_users_role
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

    const { locale, previous, proposed } =
      validateLocalizedBiographyProposal(row.snapshot, row.changes)
    const translation = await tx.execute(sql`
      SELECT localized_bio FROM barbers_locales
      WHERE _parent_id = ${barberId} AND _locale = ${locale}::public._locales
      FOR UPDATE
    `)
    if (translation.rows.length > 1) {
      throw new ProfessionalReviewConflictError('Ambiguous localized biography')
    }
    const current = translation.rows.length
      ? translation.rows[0].localized_bio : null
    if ((typeof current !== 'string' && current !== null) ||
        previous !== current ||
        localizedBiographyRevision({
          barberId, locationId, authorId, locale, value: current,
        }) !== row.base_revision) {
      throw new ProfessionalReviewConflictError('Localized biography changed')
    }
    const nextRevision = localizedBiographyRevision({
      barberId, locationId, authorId, locale, value: proposed,
    })

    // Reject revoked network admin privileges inside the same transaction.
    const isAdmin = await tx.execute(sql`
      SELECT id FROM users WHERE id = ${actor.id}
        AND role = 'admin'::public.enum_users_role
      FOR SHARE
    `)
    if (isAdmin.rows.length !== 1) {
      throw new ProfessionalReviewConflictError('Network administrator role revoked')
    }

    if (translation.rows.length) {
      const updated = await tx.execute(sql`
        UPDATE barbers_locales SET localized_bio = ${proposed}
        WHERE _parent_id = ${barberId}
          AND _locale = ${locale}::public._locales
          AND localized_bio IS NOT DISTINCT FROM ${current}
        RETURNING id
      `)
      if (updated.rows.length !== 1) {
        throw new ProfessionalReviewConflictError('Localized biography update conflict')
      }
    } else {
      const inserted = await tx.execute(sql`
        INSERT INTO barbers_locales (_parent_id, _locale, localized_bio)
        VALUES (${barberId}, ${locale}::public._locales, ${proposed})
        ON CONFLICT (_locale, _parent_id) DO NOTHING
        RETURNING id
      `)
      if (inserted.rows.length !== 1) {
        throw new ProfessionalReviewConflictError('Localized biography insert conflict')
      }
    }
    const touch = await tx.execute(sql`
      UPDATE barbers SET updated_at = NOW()
      WHERE id = ${barberId} AND user_id = ${authorId}
        AND location_id = ${locationId}
      RETURNING id
    `)
    if (touch.rows.length !== 1) {
      throw new ProfessionalReviewConflictError('Barber changed before publication')
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
      throw new ProfessionalReviewConflictError('Localized review decision conflict')
    }
    return { id: requestId, status: 'approved' as const, locale, appliedRevision: nextRevision }
  })
}
