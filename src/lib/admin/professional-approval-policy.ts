import type { LocationScope } from './location-access.ts'

export type ProfessionalStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type ProfessionalProposal = {
  id: number
  barberId: number
  locationId: number
  authorUserId: number
  status: ProfessionalStatus
  baseRevision: string
}
export type ProfessionalDecision =
  | { status: 'approved'; reason?: string }
  | { status: 'rejected'; reason: string }

export class ProfessionalReviewConflictError extends Error {
  constructor(message = 'Professional profile revision is no longer applicable') {
    super(message)
    this.name = 'ProfessionalReviewConflictError'
  }
}

/** Network administrators have final decision rights in v1.
 * Location managers may review within scope, but delegated publication is
 * explicitly NOT yet approved by product requirements.
 */
export function assertCanReviewProfessionalProposal(
  actor: LocationScope,
  proposal: ProfessionalProposal,
): void {
  if (!Number.isSafeInteger(proposal.id) || proposal.id <= 0 ||
      !Number.isSafeInteger(proposal.barberId) || proposal.barberId <= 0 ||
      !Number.isSafeInteger(proposal.locationId) || proposal.locationId <= 0 ||
      !Number.isSafeInteger(proposal.authorUserId) || proposal.authorUserId <= 0) {
    throw new RangeError('Invalid professional proposal')
  }
  if (actor.role !== 'admin' && !actor.locationIds.includes(proposal.locationId)) {
    throw new Error('Professional proposal outside assigned location')
  }
  if (proposal.status === 'draft') {
    throw new Error('Unsubmitted professional draft is private')
  }
}

export function decideProfessionalProposalPolicy(
  actor: LocationScope,
  proposal: ProfessionalProposal,
  decision: ProfessionalDecision,
  currentRevision: string,
): { status: 'approved' | 'rejected'; reviewerUserId: number; reason: string | null } {
  assertCanReviewProfessionalProposal(actor, proposal)
  if (actor.role !== 'admin') throw new Error('Only network admin may make final publication decisions')
  if (actor.userId === proposal.authorUserId) {
    throw new Error('Professional proposal self-approval prohibited')
  }
  if (proposal.status !== 'pending') throw new ProfessionalReviewConflictError('Proposal is no longer pending')
  if (decision.status !== 'approved' && decision.status !== 'rejected') {
    throw new RangeError('Invalid professional review decision')
  }
  const reason = typeof decision.reason === 'string' ? decision.reason.trim() : ''
  if (reason.length > 1000 || (decision.status === 'rejected' && !reason)) {
    throw new RangeError('Professional rejection requires an explanation')
  }
  if (decision.status === 'approved' &&
      (!/^[0-9a-f]{64}$/.test(proposal.baseRevision) ||
       currentRevision !== proposal.baseRevision)) {
    throw new ProfessionalReviewConflictError('Professional profile revision is stale')
  }
  return { status: decision.status, reviewerUserId: actor.userId, reason: reason || null }
}
