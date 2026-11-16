import type { Payload } from 'payload'

function relationId(value: unknown): number {
  const raw = value && typeof value === 'object' && 'id' in value ? value.id : value
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new RangeError('Invalid location assignment relationship')
  }
  return raw
}

/** Defense in depth: assignment rows may only refer to existing location
 * manager accounts and existing locations. The admin-only ACL must remain
 * the primary authorization boundary for creation and updates.
 */
export async function assertValidLocationAssignment(
  payload: Pick<Payload, 'findByID'>,
  user: unknown,
  location: unknown,
): Promise<void> {
  const userId = relationId(user)
  const locationId = relationId(location)
  const [account, branch] = await Promise.all([
    payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'locations', id: locationId, depth: 0, overrideAccess: true }),
  ])
  if (account.id !== userId || account.role !== 'location_admin') {
    throw new Error('Location assignment requires a location administrator account')
  }
  if (branch.id !== locationId) {
    throw new Error('Location assignment must reference a valid branch')
  }
}
