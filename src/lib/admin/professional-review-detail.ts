import type { Payload } from 'payload'
import type { LocationScope } from './location-access.ts'
import { validateBiographyProposal } from './professional-biography-revision.ts'
import { validateLocalizedBiographyProposal } from './professional-localized-biography.ts'
import { assessPortfolioProposal, type PortfolioReviewAssessment } from './portfolio-review-assessment.ts'
import { assertCanReviewProfessionalProposal, type ProfessionalProposal } from './professional-approval-policy.ts'

export type ProfessionalReviewDetail = {
  id: number
  barber: { id: number; name: string }
  locationId: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  fields: Array<{ field: 'bio' | 'localizedBio'; before: string | null; after: string | null }>
  unsupportedChangeCount: number
  approvableKind: 'bio' | 'localizedBio' | null
  localizedLocale: 'uk' | 'en' | null
  portfolioAssessment: PortfolioReviewAssessment | null
}

function idOf(value: unknown): number {
  const raw = value !== null && typeof value === 'object' && 'id' in value ? value.id : value
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new Error('Invalid professional review identity')
  }
  return raw
}
function objectOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
function textOf(value: unknown): string | null {
  if (value === null || value === undefined) return null
  // Do not pass arbitrary nested JSON or potentially unbounded drafts to UI.
  if (typeof value !== 'string' || value.length > 8000) return null
  return value
}

/** Read-only, allowlisted textual comparison. Source JSON is untrusted until
 * the separate submission contract has been finalized. Portfolio/media,
 * certificate and social-link objects are NOT rendered or downloadable here.
 */
export async function loadProfessionalReviewDetail(
  payload: Pick<Payload, 'findByID'>,
  scope: LocationScope,
  requestId: string,
): Promise<ProfessionalReviewDetail> {
  if (!/^[1-9][0-9]*$/.test(requestId) || !Number.isSafeInteger(Number(requestId))) {
    throw new RangeError('Invalid professional review ID')
  }
  const record = await payload.findByID({
    collection: 'barber-profile-revisions', id: Number(requestId),
    overrideAccess: true, depth: 0,
  })
  const proposal: ProfessionalProposal = {
    id: idOf(record.id), barberId: idOf(record.barber),
    locationId: idOf(record.location), authorUserId: idOf(record.author),
    status: record.status, baseRevision: record.baseRevision,
  }
  assertCanReviewProfessionalProposal(scope, proposal)
  // Defend against a stale/mismatched location stored on the proposal.
  const barber = await payload.findByID({
    collection: 'barbers', id: proposal.barberId,
    overrideAccess: true, depth: 0,
  })
  if (idOf(barber.location) !== proposal.locationId) {
    throw new Error('Professional review barber-location mismatch')
  }
  const snapshot = objectOf(record.snapshot)
  const proposed = objectOf(record.changes)
  let localized: ReturnType<typeof validateLocalizedBiographyProposal> | null = null
  try { localized = validateLocalizedBiographyProposal(snapshot, proposed) } catch { /* Unsupported preview */ }
  let biographyOnly = false
  try {
    validateBiographyProposal(snapshot, proposed)
    biographyOnly = true
  } catch { /* Unsupported preview */ }
  const approvableKind = biographyOnly ? 'bio' as const :
    localized ? 'localizedBio' as const : null
  const supported = ['bio', 'localizedBio'] as const
  const fields = supported.flatMap(field =>
    Object.hasOwn(proposed, field)
      ? [{ field,
        before: field === 'localizedBio' ? localized?.previous ?? null : textOf(snapshot[field]),
        after: field === 'localizedBio' ? localized?.proposed ?? null : textOf(proposed[field]),
      }]
      : [])
  const unsupportedChangeCount = Object.keys(proposed).filter(
    key => !supported.includes(key as typeof supported[number]),
  ).length
  return {
    id: proposal.id,
    barber: { id: proposal.barberId, name: barber.name },
    locationId: proposal.locationId,
    status: proposal.status as ProfessionalReviewDetail['status'],
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt ?? null,
    rejectionReason: record.status === 'rejected' ? record.rejectionReason ?? null : null,
    fields, unsupportedChangeCount,
    approvableKind, localizedLocale: localized?.locale ?? null,
    portfolioAssessment: assessPortfolioProposal(record.changes),
  }
}
