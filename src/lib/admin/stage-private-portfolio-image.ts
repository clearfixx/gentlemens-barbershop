import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { sanitizePrivatePortfolioPng } from './private-portfolio-png.ts'

export class PrivatePortfolioUploadForbidden extends Error {
  constructor(message = 'Private portfolio upload forbidden') {
    super(message)
    this.name = 'PrivatePortfolioUploadForbidden'
  }
}

/** Stages a sanitized image against a PRIVATE DRAFT, by its verified barber
 * owner only. Never modifies published Media or a submitted review.
 * The DB transaction locks the draft and barber to prevent status/owner races.
 */
export async function stagePrivatePortfolioImage(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  rawBytes: Uint8Array,
): Promise<{ id: number; revisionId: number; mimeType: 'image/png'; sizeBytes: number }> {
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0 ||
      !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      actor.role !== 'barber') {
    throw new PrivatePortfolioUploadForbidden()
  }
  const bytes = sanitizePrivatePortfolioPng(rawBytes)
  const digest = createHash('sha256').update(bytes).digest('hex')

  return payload.db.drizzle.transaction(async tx => {
    const drafts = await tx.execute(sql`
      SELECT r.id, r.author_id, r.barber_id, r.location_id, r.status::text AS status,
        r.changes,
        b.user_id AS barber_user_id, b.location_id AS barber_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      JOIN users u ON u.id = r.author_id
      WHERE r.id = ${revisionId}
        AND r.author_id = ${actor.id}
        AND u.role = 'barber'::public.enum_users_role
        AND b.is_active = TRUE
      FOR UPDATE OF r, b
    `)
    if (drafts.rows.length !== 1) throw new PrivatePortfolioUploadForbidden()
    const draft = drafts.rows[0]
    if (draft.status !== 'draft' ||
        Number(draft.barber_user_id) !== actor.id ||
        Number(draft.barber_location_id) !== Number(draft.location_id)) {
      throw new PrivatePortfolioUploadForbidden()
    }
    const changes = draft.changes
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
        !Object.hasOwn(changes, 'portfolio')) {
      throw new PrivatePortfolioUploadForbidden()
    }

    const existing = await tx.execute(sql`
      SELECT count(*)::int AS total FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
    `)
    const total = Number(existing.rows[0]?.total)
    if (!Number.isSafeInteger(total) || total < 0 || total >= 30) {
      throw new RangeError('Private portfolio technical item limit reached')
    }
    const inserted = await tx.execute(sql`
      INSERT INTO private_barber_portfolio_media
        (revision_id, barber_id, location_id, uploaded_by_id,
          mime_type, size_bytes, sha256, content)
      VALUES (${revisionId}, ${Number(draft.barber_id)},
        ${Number(draft.location_id)}, ${actor.id},
        'image/png', ${bytes.length}, ${digest}, ${bytes})
      RETURNING id
    `)
    const id = Number(inserted.rows[0]?.id)
    if (inserted.rows.length !== 1 || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Private portfolio image was not staged')
    }
    return { id, revisionId, mimeType: 'image/png' as const, sizeBytes: bytes.length }
  })
}
