import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertCanReviewProfessionalProposal,
  decideProfessionalProposalPolicy,
  ProfessionalReviewConflictError,
} from './professional-approval-policy.ts'

const admin = { userId: 5, role: 'admin' as const, locationIds: [] }
const manager = { userId: 8, role: 'location_admin' as const, locationIds: [2] }
const baseRevision = 'a'.repeat(64)
const proposal = {
  id: 10, barberId: 3, locationId: 2, authorUserId: 9,
  status: 'pending' as const, baseRevision,
}

test('manager may review only submitted proposals from assigned branches', () => {
  assert.doesNotThrow(() => assertCanReviewProfessionalProposal(manager, proposal))
  assert.throws(() => assertCanReviewProfessionalProposal(manager, {
    ...proposal, locationId: 7,
  }), /outside assigned location/)
  assert.throws(() => assertCanReviewProfessionalProposal(admin, {
    ...proposal, status: 'draft',
  }), /private/)
})

test('only network administrator may approve or reject professional publication', () => {
  assert.throws(() => decideProfessionalProposalPolicy(manager, proposal, {
    status: 'approved',
  }, baseRevision), /Only network admin/)
  assert.deepEqual(decideProfessionalProposalPolicy(admin, proposal, {
    status: 'approved',
  }, baseRevision), { status: 'approved', reviewerUserId: 5, reason: null })
  assert.deepEqual(decideProfessionalProposalPolicy(admin, proposal, {
    status: 'rejected', reason: ' Missing consent ',
  }, baseRevision), { status: 'rejected', reviewerUserId: 5, reason: 'Missing consent' })
})

test('self approval, stale changes and repeated decisions fail closed', () => {
  assert.throws(() => decideProfessionalProposalPolicy({
    ...admin, userId: proposal.authorUserId,
  }, proposal, { status: 'approved' }, baseRevision), /self-approval/)
  assert.throws(() => decideProfessionalProposalPolicy(admin, proposal, {
    status: 'approved',
  }, 'b'.repeat(64)), ProfessionalReviewConflictError)
  assert.throws(() => decideProfessionalProposalPolicy(admin, {
    ...proposal, status: 'approved',
  }, { status: 'approved' }, baseRevision), ProfessionalReviewConflictError)
})

test('rejection needs a reason even if the published revision changed', () => {
  assert.throws(() => decideProfessionalProposalPolicy(admin, proposal, {
    status: 'rejected', reason: ' ',
  }, 'b'.repeat(64)), /explanation/)
  assert.deepEqual(decideProfessionalProposalPolicy(admin, proposal, {
    status: 'rejected', reason: 'Evidence is outdated',
  }, 'b'.repeat(64)), {
    status: 'rejected', reviewerUserId: 5, reason: 'Evidence is outdated',
  })
})
