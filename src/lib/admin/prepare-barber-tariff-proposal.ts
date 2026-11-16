import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import {
  assertCanSubmitCommercialChange,
  type CommercialActor,
} from './commercial-approval-policy.ts'
import { resolveLocationScope } from './location-access.ts'

export type BarberTariffProposalInput = {
  locationId: number
  barberId: number
  serviceId: number
  kind: 'barber_price' | 'barber_duration'
  proposedValue: number
}

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}
function idOf(raw: unknown): number {
  const id = raw && typeof raw === 'object' && 'id' in raw ? raw.id : raw
  if (typeof id !== 'number' || !validId(id)) throw new RangeError('Invalid tariff relationship')
  return id
}

export function tariffRevision(value: {
  locationId: number
  barberId: number
  serviceId: number
  kind: 'barber_price' | 'barber_duration'
  baseValue: number
  overrideValue: number | null
  barberUpdatedAt: string
  serviceUpdatedAt: string
}): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Resolve authoritative proposal details from database records.
 * Only a barber's tariff may be proposed here: shared service base pricing
 * remains network-level until a branch-scoped tariff source is implemented.
 */
export async function prepareBarberTariffProposal(
  payload: Pick<Payload, 'find' | 'findByID'>,
  authenticatedUser: { id: number; role: string },
  request: BarberTariffProposalInput,
) {
  if (!validId(request.locationId) || !validId(request.barberId) ||
      !validId(request.serviceId) ||
      (request.kind !== 'barber_price' && request.kind !== 'barber_duration') ||
      !Number.isSafeInteger(request.proposedValue)) {
    throw new RangeError('Invalid barber tariff proposal input')
  }
  const scope = await resolveLocationScope(payload, authenticatedUser)
  const [barber, service] = await Promise.all([
    payload.findByID({ collection: 'barbers', id: request.barberId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'services', id: request.serviceId, depth: 0, overrideAccess: true }),
  ])
  if (idOf(barber.location) !== request.locationId ||
      idOf(barber.id) !== request.barberId ||
      idOf(service.id) !== request.serviceId) {
    throw new Error('Tariff target does not belong to requested location')
  }
  const offerings = (barber.serviceOfferings ?? []) as Array<{
    service: unknown
    priceOverride?: number | null
    durationOverrideMinutes?: number | null
  }>
  const matches = offerings.filter(row => idOf(row.service) === request.serviceId)
  if (matches.length !== 1) throw new Error('Missing or ambiguous barber service offering')
  const match = matches[0]
  const isPrice = request.kind === 'barber_price'
  const baseValue = isPrice ? service.price : service.durationMinutes
  const overrideValue = isPrice ? match.priceOverride : match.durationOverrideMinutes
  const oldValue = overrideValue ?? baseValue
  if (typeof oldValue !== 'number' || !Number.isSafeInteger(oldValue) ||
      (overrideValue !== null && overrideValue !== undefined && !Number.isSafeInteger(overrideValue))) {
    throw new RangeError('Invalid current barber tariff')
  }
  const expectedRevision = tariffRevision({
    locationId: request.locationId,
    barberId: request.barberId,
    serviceId: request.serviceId,
    kind: request.kind,
    baseValue,
    overrideValue: overrideValue ?? null,
    barberUpdatedAt: barber.updatedAt,
    serviceUpdatedAt: service.updatedAt,
  })
  const actor: CommercialActor = {
    userId: scope.userId, role: scope.role, locationIds: scope.locationIds,
  }
  assertCanSubmitCommercialChange(actor, {
    locationId: request.locationId,
    kind: request.kind,
    oldValue,
    proposedValue: request.proposedValue,
    expectedRevision,
  })
  return {
    location: request.locationId,
    barber: request.barberId,
    service: request.serviceId,
    createdBy: scope.userId,
    kind: request.kind,
    oldValue,
    proposedValue: request.proposedValue,
    expectedRevision,
    status: 'pending' as const,
  }
}

/** Trusted submission boundary. Caller supplies the authenticated Payload user,
 * not a user ID from JSON. A proposal is saved pending only: this function
 * never changes live services, appointments, or barber offerings.
 * Approval must re-check current revision inside its write transaction.
 */
export async function submitBarberTariffProposal(
  payload: Payload,
  authenticatedUser: { id: number; role: string },
  request: BarberTariffProposalInput,
) {
  const proposal = await prepareBarberTariffProposal(payload, authenticatedUser, request)
  return payload.create({
    collection: 'commercial-change-requests',
    overrideAccess: true,
    depth: 0,
    data: proposal,
  })
}
