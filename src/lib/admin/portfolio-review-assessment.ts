/** Administrative assessment ONLY. This does not grant upload or publish
 * access. Media ownership, source authenticity and customer consent must be
 * verified by a trusted server-side workflow before any public exposure.
 */
export type PortfolioReviewAssessment = {
  kind: 'portfolio'
  itemCount: number
  evidence: {
    rightsDeclarations: number
    clientConsentDeclarations: number
    missingRightsDeclarations: number
    missingClientConsentDeclarations: number
  }
  structurallyValid: boolean
  issues: Array<'invalid_shape' | 'invalid_media_reference' | 'invalid_metadata' |
    'duplicate_media' | 'missing_rights_declaration' | 'missing_consent_declaration'>
}

type Photo = {
  mediaId: number
  alt: string
  caption?: string
  sortOrder: number
  rightsDeclared: boolean
  clientConsentDeclared: boolean
}

/** Inspect narrow structured metadata while explicitly never returning photo
 * URLs, user identity, original comments or arbitrary proposal JSON.
 *
 * Client-provided boolean declarations are *not proof*. Even a valid assessment
 * is NOT permission to approve without independent media checks.
 */
export function assessPortfolioProposal(changes: unknown): PortfolioReviewAssessment | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null
  const object = changes as Record<string, unknown>
  if (!Object.hasOwn(object, 'portfolio')) return null
  const issues = new Set<PortfolioReviewAssessment['issues'][number]>()
  if (Object.keys(object).length !== 1) issues.add('invalid_shape')
  const portfolio = object.portfolio
  const images = portfolio && typeof portfolio === 'object' &&
      !Array.isArray(portfolio) && 'items' in portfolio
    ? (portfolio as { items: unknown }).items : undefined
  if (!Array.isArray(images) || images.length < 1 || images.length > 30) {
    return {
      kind: 'portfolio', itemCount: 0,
      evidence: {
        rightsDeclarations: 0, clientConsentDeclarations: 0,
        missingRightsDeclarations: 0, missingClientConsentDeclarations: 0,
      }, structurallyValid: false, issues: ['invalid_shape'],
    }
  }
  if (portfolio && typeof portfolio === 'object' && !Array.isArray(portfolio) &&
      Object.keys(portfolio).length !== 1) issues.add('invalid_shape')
  const seen = new Set<number>()
  let rights = 0
  let consents = 0
  for (const raw of images) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.add('invalid_shape')
      continue
    }
    const item = raw as Record<string, unknown>
    const keys = Object.keys(item)
    const allowed = ['mediaId', 'alt', 'caption', 'sortOrder', 'rightsDeclared', 'clientConsentDeclared']
    if (keys.some(k => !allowed.includes(k)) ||
        !['mediaId', 'alt', 'sortOrder', 'rightsDeclared', 'clientConsentDeclared'].every(k => Object.hasOwn(item, k))) {
      issues.add('invalid_shape')
    }
    if (typeof item.mediaId !== 'number' || !Number.isSafeInteger(item.mediaId) || item.mediaId <= 0) {
      issues.add('invalid_media_reference')
    } else if (seen.has(item.mediaId)) {
      issues.add('duplicate_media')
    } else {
      seen.add(item.mediaId)
    }
    if (typeof item.alt !== 'string' || item.alt.trim().length < 3 ||
        item.alt.length > 240 || (item.caption !== undefined &&
          (typeof item.caption !== 'string' || item.caption.length > 1000)) ||
        typeof item.sortOrder !== 'number' || !Number.isSafeInteger(item.sortOrder) ||
        item.sortOrder < 0 || item.sortOrder > 1000) {
      issues.add('invalid_metadata')
    }
    if (item.rightsDeclared === true) rights++
    else issues.add('missing_rights_declaration')
    if (item.clientConsentDeclared === true) consents++
    else issues.add('missing_consent_declaration')
    if (typeof item.rightsDeclared !== 'boolean' || typeof item.clientConsentDeclared !== 'boolean') {
      issues.add('invalid_shape')
    }
  }
  const ordered = [...issues]
  return {
    kind: 'portfolio', itemCount: images.length,
    evidence: {
      rightsDeclarations: rights,
      clientConsentDeclarations: consents,
      missingRightsDeclarations: images.length - rights,
      missingClientConsentDeclarations: images.length - consents,
    },
    structurallyValid: ordered.length === 0,
    issues: ordered,
  }
}
