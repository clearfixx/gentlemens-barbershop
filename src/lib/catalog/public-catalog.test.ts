import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCatalogId } from './public-catalog.ts'
import { localizedCopy } from '../../i18n/localized-copy.ts'

test('accepts only bounded positive decimal catalog IDs', () => {
  assert.equal(parseCatalogId('1'), 1)
  assert.equal(parseCatalogId('123456789'), 123456789)
  for (const invalid of [undefined, '', '0', '-1', '1.2', '01', '1abc', '1000000000']) {
    assert.equal(parseCatalogId(invalid), undefined)
  }
})

test('localized copy prefers the requested translation over legacy content', () => {
  assert.equal(localizedCopy({ localizedDescription: 'English copy', description: 'Old copy' }, 'localizedDescription', 'description'), 'English copy')
  assert.equal(localizedCopy({ localizedBio: 'English bio', bio: 'Old bio' }, 'localizedBio', 'bio'), 'English bio')
})

test('localized copy falls back to legacy content when translation is empty', () => {
  assert.equal(localizedCopy({ localizedDescription: '  ', description: 'Legacy description' }, 'localizedDescription', 'description'), 'Legacy description')
  assert.equal(localizedCopy({ localizedBio: null, bio: 'Legacy bio' }, 'localizedBio', 'bio'), 'Legacy bio')
  assert.equal(localizedCopy({ description: '' }, 'localizedDescription', 'description'), null)
  assert.equal(localizedCopy({}, 'localizedBio', 'bio'), null)
})
