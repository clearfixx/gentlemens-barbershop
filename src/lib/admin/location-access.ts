import type { Payload } from 'payload'

type UserIdentity = { id: number; role: string }
export type LocationScope = { userId: number; role: 'admin' | 'location_admin'; locationIds: number[] }

function numericId(value: unknown): number {
  const id = typeof value === 'object' && value !== null && 'id' in value
    ? (value as { id: unknown }).id : value
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Invalid location administrator assignment')
  }
  return id
}

/** Read scope from trusted DB assignments, never from a locationIds request parameter.
 * A network admin has unrestricted location access; locationIds=[] is intentional.
 */
export async function resolveLocationScope(
  payload: Pick<Payload, 'find'>,
  user: UserIdentity | null,
): Promise<LocationScope> {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error('Location administration requires authentication')
  }
  if (user.role === 'admin') return { userId: user.id, role: 'admin', locationIds: [] }
  if (user.role !== 'location_admin') {
    throw new Error('Location administration forbidden')
  }
  const ids = new Set<number>()
  let page = 1
  // Fail closed if assignments exceed the supported paging budget.
  while (page <= 100) {
    const result = await payload.find({
      collection: 'location-assignments',
      overrideAccess: true,
      depth: 0,
      where: { and: [
        { user: { equals: user.id } },
        { isActive: { equals: true } },
      ] },
      limit: 100,
      page,
    })
    for (const row of result.docs) {
      if (numericId(row.user) !== user.id) {
        throw new Error('Location assignment ownership mismatch')
      }
      ids.add(numericId(row.location))
    }
    if (!result.hasNextPage) {
      if (ids.size === 0) throw new Error('No active assigned locations')
      return { userId: user.id, role: 'location_admin', locationIds: [...ids] }
    }
    page += 1
  }
  throw new Error('Location assignment query exceeds bounds')
}

export function assertLocationAccess(scope: LocationScope, locationId: number): void {
  if (!Number.isSafeInteger(locationId) || locationId <= 0 ||
      (scope.role !== 'admin' && !scope.locationIds.includes(locationId))) {
    throw new Error('Location access forbidden')
  }
}
