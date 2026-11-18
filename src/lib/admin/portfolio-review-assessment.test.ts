import assert from 'node:assert/strict'
import test from 'node:test'
import { assessPortfolioProposal } from './portfolio-review-assessment.ts'

const photo = {
  mediaId: 7, alt: 'Haircut side profile', caption: 'Textured crop',
  sortOrder: 1, rightsDeclared: true, clientConsentDeclared: true,
}

test('valid declaration metadata is not treated as proof of media ownership', () => {
  const result = assessPortfolioProposal({ portfolio: { items: [photo] } })
  assert.deepEqual(result, {
    kind: 'portfolio', itemCount: 1,
    evidence: { rightsDeclarations: 1, clientConsentDeclarations: 1,
      missingRightsDeclarations: 0, missingClientConsentDeclarations: 0 },
    structurallyValid: true, issues: [],
  })
  assert.doesNotMatch(JSON.stringify(result), /Haircut|Textured|mediaId/)
})

test('missing consent and rights declarations are clearly flagged', () => {
  const result = assessPortfolioProposal({ portfolio: { items: [{
    ...photo, rightsDeclared: false, clientConsentDeclared: false,
  }] } })
  assert.equal(result?.structurallyValid, false)
  assert.deepEqual(result?.evidence, {
    rightsDeclarations: 0, clientConsentDeclarations: 0,
    missingRightsDeclarations: 1, missingClientConsentDeclarations: 1,
  })
  assert.ok(result?.issues.includes('missing_rights_declaration'))
  assert.ok(result?.issues.includes('missing_consent_declaration'))
})

test('mixed professional fields, duplicate media and unexpected fields fail closed', () => {
  const result = assessPortfolioProposal({
    portfolio: { items: [photo, { ...photo, sortOrder: 2, privateUrl: 'https://private' }] },
    bio: 'Silent additional publication',
  })
  assert.equal(result?.structurallyValid, false)
  assert.ok(result?.issues.includes('invalid_shape'))
  assert.ok(result?.issues.includes('duplicate_media'))
  assert.doesNotMatch(JSON.stringify(result), /privateUrl|https|Silent/)
})

test('invalid shape, unbounded arrays and malformed metadata are redacted', () => {
  assert.equal(assessPortfolioProposal({ bio: 'Not a portfolio' }), null)
  for (const raw of [null, {}, { items: [] }, { items: Array(31).fill(photo) }]) {
    const result = assessPortfolioProposal({ portfolio: raw })
    assert.equal(result?.structurallyValid, false)
    assert.deepEqual(result?.issues, ['invalid_shape'])
  }
  const result = assessPortfolioProposal({ portfolio: { items: [{
    ...photo, mediaId: '7', alt: '<script>', sortOrder: -1,
  }] } })
  assert.equal(result?.structurallyValid, false)
  assert.ok(result?.issues.includes('invalid_media_reference'))
  assert.ok(result?.issues.includes('invalid_metadata'))
})
