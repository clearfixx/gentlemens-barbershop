import type { ApprovalDecision } from './commercial-approval-policy.ts'
import type { BarberTariffProposalInput } from './prepare-barber-tariff-proposal.ts'

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('Invalid commercial request body')
  }
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new RangeError('Unexpected commercial request field')
  }
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseTariffSubmission(body: unknown): BarberTariffProposalInput {
  const value = record(body)
  exactKeys(value, ['locationId', 'barberId', 'serviceId', 'kind', 'proposedValue'])
  if (!positiveInteger(value.locationId) || !positiveInteger(value.barberId) ||
      !positiveInteger(value.serviceId) ||
      (value.kind !== 'barber_price' && value.kind !== 'barber_duration') ||
      typeof value.proposedValue !== 'number' || !Number.isSafeInteger(value.proposedValue)) {
    throw new RangeError('Invalid commercial proposal')
  }
  return {
    locationId: value.locationId,
    barberId: value.barberId,
    serviceId: value.serviceId,
    kind: value.kind,
    proposedValue: value.proposedValue,
  }
}

export function parseTariffDecision(body: unknown): ApprovalDecision {
  const value = record(body)
  exactKeys(value, ['status', 'reason'])
  if (value.status !== 'approved' && value.status !== 'rejected') {
    throw new RangeError('Invalid commercial decision')
  }
  if (value.reason !== undefined &&
      (typeof value.reason !== 'string' || value.reason.length > 1000)) {
    throw new RangeError('Invalid commercial decision reason')
  }
  const reason = typeof value.reason === 'string' ? value.reason.trim() : undefined
  if (value.status === 'rejected' && !reason) {
    throw new RangeError('Rejection reason is required')
  }
  return { status: value.status, ...(reason ? { reason } : {}) }
}

/** Enforce same-origin POST requests, independent of cookies/session auth.
 * A missing Origin is rejected for these browser-facing staff mutations.
 */
export function assertCommercialMutationOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Error('Invalid commercial request origin')
  }
}
