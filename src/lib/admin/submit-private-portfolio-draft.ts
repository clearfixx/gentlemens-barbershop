import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { assessPortfolioProposal } from './portfolio-review-assessment.ts'

export class PortfolioSubmissionConflict extends Error {
  constructor(message = 'Portfolio draft is unavailable or already submitted') {
    super(message)
    this.name = 'PortfolioSubmissionConflict'
  }
}
export type PortfolioSubmissionItem = {
  mediaId: number
  alt: string
  caption?: string
  sortOrder: number
  rightsDeclared: boolean
  clientConsentDeclared: boolean
}

export function validatePortfolioSubmission(input: unknown): PortfolioSubmissionItem[] {
  const assessment = assessPortfolioProposal({ portfolio: input })
  if (!assessment?.structurallyValid || !input || typeof input !== 'object' ||
      !('items' in input) || !Array.isArray(input.items)) {
    throw new RangeError('Invalid portfolio metadata or missing declarations')
  }
  const items = input.items as PortfolioSubmissionItem[]
  const orders = new Set(items.map(item => item.sortOrder))
  if (orders.size !== items.length) {
    throw new RangeError('Portfolio order values must be unique')
  }
  // Order is canonical and independent from the client's JSON object order.
  return items.map(item => ({
    mediaId: item.mediaId,
    alt: item.alt.trim(),
    ...(item.caption !== undefined ? { caption: item.caption.trim() } : {}),
    sortOrder: item.sortOrder,
    rightsDeclared: true,
    clientConsentDeclared: true,
  })).sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function submitPrivatePortfolioDraft(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: string },
  revisionId: number,
  proposed: unknown,
): Promise<{ id: number; status: 'pending'; mediaCount: number; manifestSha256: string }> {
  if (actor.role !== 'barber' || !Number.isSafeInteger(actor.id) || actor.id <= 0 ||
      !Number.isSafeInteger(revisionId) || revisionId <= 0) {
    throw new PortfolioSubmissionConflict()
  }
  const items = validatePortfolioSubmission(proposed)
  return payload.db.drizzle.transaction(async tx => {
    const found = await tx.execute(sql`
      SELECT r.id, r.author_id, r.barber_id, r.location_id, r.status::text AS status,
        r.snapshot, r.changes,
        b.user_id AS barber_user_id, b.location_id AS barber_location_id
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      JOIN users u ON u.id = r.author_id
      WHERE r.id = ${revisionId} AND r.author_id = ${actor.id}
        AND u.role = 'barber'::public.enum_users_role AND b.is_active = TRUE
      FOR UPDATE OF r, b
    `)
    if (found.rows.length !== 1) throw new PortfolioSubmissionConflict()
    const row = found.rows[0]
    if (row.status !== 'draft' || Number(row.author_id) !== actor.id ||
        Number(row.barber_user_id) !== actor.id ||
        Number(row.location_id) !== Number(row.barber_location_id)) {
      throw new PortfolioSubmissionConflict()
    }
    const changes = row.changes
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
        Object.keys(changes).length !== 1 || !Object.hasOwn(changes, 'portfolio')) {
      throw new PortfolioSubmissionConflict('Unsupported mixed-content draft')
    }

    // Both staging and submission lock the same revision row first.
    // This prevents a photo being inserted while the manifest is finalized.
    const stored = await tx.execute(sql`
      SELECT id, mime_type, size_bytes, sha256
      FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
        AND barber_id = ${Number(row.barber_id)}
        AND location_id = ${Number(row.location_id)}
        AND uploaded_by_id = ${actor.id}
      ORDER BY id
      FOR UPDATE
    `)
    if (stored.rows.length !== items.length) {
      throw new PortfolioSubmissionConflict('Submitted portfolio image set does not match stored images')
    }
    const mediaById = new Map<number, { mime: string; size: number; sha: string }>()
    for (const image of stored.rows) {
      const id = Number(image.id), size = Number(image.size_bytes)
      if (!Number.isSafeInteger(id) || id <= 0 || mediaById.has(id) ||
          !Number.isSafeInteger(size) || size < 1 || size > 5 * 1024 * 1024 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(String(image.mime_type)) ||
          typeof image.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(image.sha256)) {
        throw new PortfolioSubmissionConflict('Invalid private image custody metadata')
      }
      mediaById.set(id, { mime: String(image.mime_type), size, sha: image.sha256 })
    }
    if (items.some(item => !mediaById.has(item.mediaId))) {
      throw new PortfolioSubmissionConflict('Foreign image reference in portfolio')
    }
    const manifest = items.map(item => ({
      ...item, image: mediaById.get(item.mediaId)!,
    }))
    const manifestSha256 = createHash('sha256')
      .update(JSON.stringify(['barber-portfolio-manifest-v1',
        Number(row.barber_id), Number(row.location_id), actor.id, manifest]))
      .digest('hex')
    // No publication occurs here. The approved-content workflow must recheck
    // this manifest and consent evidence before any public gallery exists.
    const updated = await tx.execute(sql`
      UPDATE barber_profile_revisions
      SET changes = ${JSON.stringify({ portfolio: { items } })}::jsonb,
        submitted_manifest_hash = ${manifestSha256},
        status = 'pending'::public.enum_barber_profile_revisions_status,
        updated_at = NOW()
      WHERE id = ${revisionId}
        AND status = 'draft'::public.enum_barber_profile_revisions_status
        AND author_id = ${actor.id}
      RETURNING id
    `)
    if (updated.rows.length !== 1) throw new PortfolioSubmissionConflict()
    return { id: revisionId, status: 'pending' as const,
      mediaCount: items.length, manifestSha256 }
  })
}
