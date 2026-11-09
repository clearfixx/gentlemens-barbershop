import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCatalogId } from './public-catalog.ts'

test('accepts only bounded positive decimal catalog IDs', () => {
  assert.equal(parseCatalogId('1'), 1)
  assert.equal(parseCatalogId('123456789'), 123456789)
  for (const invalid of [undefined, '', '0', '-1', '1.2', '01', '1abc', '1000000000']) {
    assert.equal(parseCatalogId(invalid), undefined)
  }
})
