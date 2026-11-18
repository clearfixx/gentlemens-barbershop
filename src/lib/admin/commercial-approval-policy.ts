/** Business rules for a proposed location-level commercial change.
 * Pure functions: persistence and approval audit must run in one DB transaction.
 * A proposal never mutates live pricing or service offerings on submission.
 */
export const commercialChangeKinds = [
  'service_price',
  'service_duration',
  'barber_price',
  'barber_duration',
  'service_assignment',
] as const

export type CommercialChangeKind = typeof commercialChangeKinds[number]
export type CommercialApprovalStatus = 'pending' | 'approved' | 'rejected'
export type CommercialActor = {
  userId: number
  role: 'admin' | 'location_admin' | 'barber' | 'customer'
  locationIds: readonly number[]
}
export type CommercialChange = {
  id: number
  locationId: number
  kind: CommercialChangeKind
  status: CommercialApprovalStatus
  createdBy: number
  expectedRevision: string
  oldValue: number | boolean
  proposedValue: number | boolean
}
export type ApprovalDecision = { status: 'approved' | 'rejected'; reason?: string }

function positiveId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}
function validCommercialValue(kind: CommercialChangeKind, value: number | boolean): boolean {
  if (kind === 'service_assignment') return typeof value === 'boolean'
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  return kind === 'service_price' || kind === 'barber_price'
    ? value >= 0
    : value >= 5 && value <= 480
}
function validRevision(revision: string): boolean {
  return typeof revision === 'string' && revision.length > 0 && revision.length <= 128
}

/** Submission authorization is checked against a server-derived assignment, not a request-supplied location list. */
export function assertCanSubmitCommercialChange(
  actor: CommercialActor,
  proposed: Pick<CommercialChange, 'locationId' | 'kind' | 'oldValue' | 'proposedValue' | 'expectedRevision'>,
): void {
  if (!positiveId(actor.userId) || !positiveId(proposed.locationId) ||
      (actor.role !== 'admin' && (actor.role !== 'location_admin' ||
        !actor.locationIds.includes(proposed.locationId)))) {
    throw new Error('Commercial change submission forbidden')
  }
  if (!commercialChangeKinds.includes(proposed.kind) ||
      !validCommercialValue(proposed.kind, proposed.oldValue) ||
      !validCommercialValue(proposed.kind, proposed.proposedValue) ||
      proposed.oldValue === proposed.proposedValue ||
      !validRevision(proposed.expectedRevision)) {
    throw new RangeError('Invalid commercial change proposal')
  }
}

/** Returns an immutable transition payload. The caller must atomically validate the
 * persisted pending status and live revision before applying approved changes.
 */
export function decideCommercialChange(
  actor: CommercialActor,
  change: CommercialChange,
  decision: ApprovalDecision,
  currentRevision: string,
): { status: 'approved' | 'rejected'; decidedBy: number; reason: string | null } {
  if (actor.role !== 'admin' || !positiveId(actor.userId)) {
    throw new Error('Commercial approval restricted to network administrator')
  }
  if (change.status !== 'pending') throw new Error('Commercial proposal is no longer pending')
  if (!positiveId(change.id) || !positiveId(change.locationId) || !positiveId(change.createdBy)) {
    throw new RangeError('Invalid commercial proposal identity')
  }
  if (change.createdBy === actor.userId) {
    throw new Error('Self approval is not permitted')
  }
  if (decision.status !== 'approved' && decision.status !== 'rejected') {
    throw new RangeError('Invalid commercial decision')
  }
  if (decision.status === 'approved' && (
    !validRevision(currentRevision) || currentRevision !== change.expectedRevision
  )) {
    throw new Error('Commercial proposal is stale; refresh before approval')
  }
  const reason = decision.reason?.trim() || null
  if (decision.status === 'rejected' && (!reason || reason.length > 1000)) {
    throw new RangeError('Rejection reason is required (maximum 1000 characters)')
  }
  if (reason && reason.length > 1000) throw new RangeError('Decision reason too long')
  return { status: decision.status, decidedBy: actor.userId, reason }
}
