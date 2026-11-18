import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

type PrivateMediaPayload = Pick<Payload, 'db'>
type StaffActor = { id: number; role: 'admin' | 'location_admin' }

function validId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}
function assertActor(actor: StaffActor, revisionId: number): void {
  if (!validId(actor.id) || !validId(revisionId) ||
      (actor.role !== 'admin' && actor.role !== 'location_admin')) {
    throw new RangeError('Invalid portfolio review identity')
  }
}

/** The DB checks CURRENT staff assignment/role and the submitted revision
 * on each request. Drafts are never exposed through a preview route.
 */
function currentReviewAccess(actor: StaffActor) {
  return actor.role === 'admin'
    ? sql`EXISTS (SELECT 1 FROM users u WHERE u.id = ${actor.id}
        AND u.role = 'admin'::public.enum_users_role)`
    : sql`EXISTS (
        SELECT 1 FROM users u
        JOIN location_assignments a ON a.user_id = u.id
        WHERE u.id = ${actor.id}
          AND u.role = 'location_admin'::public.enum_users_role
          AND a.location_id = r.location_id AND a.is_active = TRUE
      )`
}

export async function listPrivatePortfolioReviewMedia(
  payload: PrivateMediaPayload,
  actor: StaffActor,
  revisionId: number,
): Promise<Array<{ id: number; mimeType: string; sizeBytes: number }>> {
  assertActor(actor, revisionId)
  const access = currentReviewAccess(actor)
  const result = await payload.db.drizzle.execute(sql`
    SELECT m.id, m.mime_type, m.size_bytes
    FROM private_barber_portfolio_media m
    JOIN barber_profile_revisions r ON r.id = m.revision_id
    JOIN barbers b ON b.id = r.barber_id
    WHERE r.id = ${revisionId}
      AND r.status IN (
        'pending'::public.enum_barber_profile_revisions_status,
        'approved'::public.enum_barber_profile_revisions_status,
        'rejected'::public.enum_barber_profile_revisions_status
      )
      AND m.barber_id = r.barber_id
      AND m.location_id = r.location_id
      AND m.uploaded_by_id = r.author_id
      AND b.user_id = r.author_id AND b.location_id = r.location_id
      AND ${access}
    ORDER BY m.id ASC
    LIMIT 31
  `)
  if (result.rows.length > 30) throw new Error('Excess private review media')
  return result.rows.map(row => {
    const id = Number(row.id), sizeBytes = Number(row.size_bytes)
    if (!validId(id) || !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 || sizeBytes > 5242880 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(String(row.mime_type))) {
      throw new Error('Malformed private media listing')
    }
    return { id, sizeBytes, mimeType: String(row.mime_type) }
  })
}

export class PrivatePortfolioMediaNotFound extends Error {
  constructor() {
    super('Private portfolio image unavailable')
    this.name = 'PrivatePortfolioMediaNotFound'
  }
}
function matchesMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 4 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') return bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((part, i) => bytes[i] === part)
  if (mime === 'image/webp') return bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  return false
}

export async function readPrivatePortfolioReviewImage(
  payload: PrivateMediaPayload,
  actor: StaffActor,
  revisionId: number,
  imageId: number,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  assertActor(actor, revisionId)
  if (!validId(imageId)) throw new RangeError('Invalid portfolio image ID')
  const access = currentReviewAccess(actor)
  const result = await payload.db.drizzle.execute(sql`
    SELECT m.content, m.mime_type, m.size_bytes, m.sha256
    FROM private_barber_portfolio_media m
    JOIN barber_profile_revisions r ON r.id = m.revision_id
    JOIN barbers b ON b.id = r.barber_id
    WHERE m.id = ${imageId} AND r.id = ${revisionId}
      AND r.status IN (
        'pending'::public.enum_barber_profile_revisions_status,
        'approved'::public.enum_barber_profile_revisions_status,
        'rejected'::public.enum_barber_profile_revisions_status
      )
      AND m.barber_id = r.barber_id
      AND m.location_id = r.location_id
      AND m.uploaded_by_id = r.author_id
      AND b.user_id = r.author_id AND b.location_id = r.location_id
      AND ${access}
    LIMIT 1
  `)
  if (result.rows.length !== 1) throw new PrivatePortfolioMediaNotFound()
  const row = result.rows[0]
  const mimeType = String(row.mime_type)
  const bytes = row.content instanceof Uint8Array
    ? row.content : typeof row.content === 'string' &&
        row.content.startsWith('\\x')
      ? Buffer.from(row.content.slice(2), 'hex') : null
  if (!bytes || bytes.byteLength !== Number(row.size_bytes) ||
      bytes.byteLength < 1 || bytes.byteLength > 5242880 ||
      !matchesMagic(bytes, mimeType) ||
      createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new PrivatePortfolioMediaNotFound()
  }
  return { bytes, mimeType }
}
