import { createHash } from 'node:crypto'

/** Canonical revision shared by professional draft submission and final review.
 * Never rely on an editor-provided revision to authorize publication.
 */
export function biographyRevision(input: {
  barberId: number
  locationId: number
  authorId: number
  bio: string | null
}): string {
  if (![input.barberId, input.locationId, input.authorId].every(value =>
    Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('Invalid professional revision identity')
  }
  if (input.bio !== null &&
      (typeof input.bio !== 'string' || input.bio.length > 8000)) {
    throw new RangeError('Invalid published biography')
  }
  return createHash('sha256').update(JSON.stringify([
    'barber-bio-v1', input.barberId, input.locationId, input.authorId, input.bio,
  ])).digest('hex')
}

export function validateBiographyProposal(snapshot: unknown, changes: unknown): {
  previous: string | null
  proposed: string | null
} {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new RangeError('Invalid professional proposal payload')
  }
  const before = snapshot as Record<string, unknown>
  const after = changes as Record<string, unknown>
  // Fail closed: unimplemented portfolio/localized fields cannot be silently
  // omitted while marking an entire proposal approved.
  if (Object.keys(before).length !== 1 || Object.keys(after).length !== 1 ||
      !Object.hasOwn(before, 'bio') || !Object.hasOwn(after, 'bio')) {
    throw new RangeError('Professional proposal contains unsupported fields')
  }
  const previous = before.bio === null ? null : before.bio
  const proposed = after.bio === null ? null : after.bio
  if ((previous !== null && (typeof previous !== 'string' || previous.length > 8000)) ||
      (proposed !== null && (typeof proposed !== 'string' || proposed.length > 8000))) {
    throw new RangeError('Invalid professional biography values')
  }
  if (previous === proposed) throw new RangeError('No biography changes to approve')
  return { previous: previous as string | null, proposed: proposed as string | null }
}
