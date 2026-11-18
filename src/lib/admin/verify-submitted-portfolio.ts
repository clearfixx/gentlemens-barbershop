import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { computeSubmittedPortfolioManifest } from './portfolio-manifest-integrity.ts'
import { validatePortfolioSubmission } from './submit-private-portfolio-draft.ts'

export class PortfolioReviewUnavailable extends Error {
  constructor() {
    super('Portfolio review unavailable')
    this.name = 'PortfolioReviewUnavailable'
  }
}
export type PortfolioIntegrityReport = {
  status: 'verified' | 'not_submitted' | 'mismatch'
  imageCount: number
  checks: {
    metadata: boolean
    imageSet: boolean
    imageBytes: boolean
    manifest: boolean
  }
}

/** Review-only integrity check, NOT evidence of legal rights or client consent.
 * Locks the submitted review and its media in one DB transaction while
 * recomputing the original SHA-256 from canonical metadata and actual bytes.
 * Only returns boolean results; never sends media bytes or raw draft JSON.
 */
export async function verifySubmittedPortfolioForStaff(
  payload: Pick<Payload, 'db'>,
  actor: { id: number; role: 'admin' | 'location_admin' },
  revisionId: number,
): Promise<PortfolioIntegrityReport> {
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 ||
    !Number.isSafeInteger(revisionId) || revisionId <= 0 ||
    !['admin', 'location_admin'].includes(actor.role)) {
    throw new PortfolioReviewUnavailable()
  }
  return payload.db.drizzle.transaction(async tx => {
    const allowed = actor.role === 'admin'
      ? sql`EXISTS (
          SELECT 1 FROM users u WHERE u.id = ${actor.id}
            AND u.role = 'admin'::public.enum_users_role
        )`
      : sql`EXISTS (
          SELECT 1 FROM users u
          JOIN location_assignments a ON a.user_id = u.id
          WHERE u.id = ${actor.id}
            AND u.role = 'location_admin'::public.enum_users_role
            AND a.is_active = TRUE AND a.location_id = r.location_id
        )`
    const found = await tx.execute(sql`
      SELECT r.id, r.barber_id, r.location_id, r.author_id,
        r.status::text AS status, r.changes, r.submitted_manifest_hash
      FROM barber_profile_revisions r
      JOIN barbers b ON b.id = r.barber_id
      WHERE r.id = ${revisionId}
        AND r.status IN (
          'pending'::public.enum_barber_profile_revisions_status,
          'approved'::public.enum_barber_profile_revisions_status,
          'rejected'::public.enum_barber_profile_revisions_status
        )
        AND b.user_id = r.author_id AND b.location_id = r.location_id
        AND ${allowed}
      FOR SHARE OF r, b
    `)
    if (found.rows.length !== 1) throw new PortfolioReviewUnavailable()
    const record = found.rows[0]
    const hash = record.submitted_manifest_hash
    if (hash === null || hash === undefined) {
      return { status: 'not_submitted', imageCount: 0,
        checks: { metadata: false, imageSet: false, imageBytes: false, manifest: false } }
    }
    const result: PortfolioIntegrityReport = {
      status: 'mismatch', imageCount: 0,
      checks: { metadata: false, imageSet: false, imageBytes: false, manifest: false },
    }
    const proposal = record.changes
    let items: ReturnType<typeof validatePortfolioSubmission>
    try {
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) ||
          Object.keys(proposal).length !== 1 || !Object.hasOwn(proposal, 'portfolio')) return result
      items = validatePortfolioSubmission((proposal as Record<string, unknown>).portfolio)
      result.checks.metadata = true
    } catch {
      return result
    }

    const photos = await tx.execute(sql`
      SELECT id, barber_id, location_id, uploaded_by_id,
        mime_type, size_bytes, sha256, content
      FROM private_barber_portfolio_media
      WHERE revision_id = ${revisionId}
      ORDER BY id
      LIMIT 31
      FOR SHARE
    `)
    result.imageCount = photos.rows.length
    if (photos.rows.length !== items.length || photos.rows.length > 30) return result
    const custody: Array<{ id: number; mime: string; size: number; sha: string }> = []
    let verifiedBytes = true
    for (const photo of photos.rows) {
      const mime = String(photo.mime_type)
      const id = Number(photo.id), size = Number(photo.size_bytes)
      const sha = String(photo.sha256)
      if (Number(photo.barber_id) !== Number(record.barber_id) ||
          Number(photo.location_id) !== Number(record.location_id) ||
          Number(photo.uploaded_by_id) !== Number(record.author_id)) return result
      const bytes = photo.content instanceof Uint8Array ? photo.content :
        typeof photo.content === 'string' && photo.content.startsWith('\\x')
          ? Buffer.from(photo.content.slice(2), 'hex') : null
      if (!bytes || bytes.length !== size || size < 1 || size > 5242880 ||
          createHash('sha256').update(bytes).digest('hex') !== sha) {
        verifiedBytes = false
      }
      custody.push({ id, mime, size, sha })
    }
    result.checks.imageBytes = verifiedBytes
    try {
      const recomputed = computeSubmittedPortfolioManifest({
        barberId: Number(record.barber_id),
        locationId: Number(record.location_id),
        authorId: Number(record.author_id),
      }, items, custody)
      result.checks.imageSet = true
      result.checks.manifest = typeof hash === 'string' &&
        /^[0-9a-f]{64}$/.test(hash) && recomputed === hash
    } catch {
      return result
    }
    if (Object.values(result.checks).every(Boolean)) result.status = 'verified'
    return result
  })
}
