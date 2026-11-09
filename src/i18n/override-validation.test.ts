import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateTranslationOverrides } from './override-validation.ts'

test('accepts valid known translation overrides and an empty draft', () => {
  assert.equal(validateTranslationOverrides({}), true)
  assert.equal(validateTranslationOverrides({ 'nav.home': 'Homepage', 'actions.bookNow': 'Book now' }), true)
})

test('rejects unknown keys, markup, invalid values and oversized content', () => {
  assert.notEqual(validateTranslationOverrides({ 'admin.role': 'admin' }), true)
  assert.notEqual(validateTranslationOverrides({ 'nav.home': '<script>' }), true)
  assert.notEqual(validateTranslationOverrides({ 'nav.home': 123 }), true)
  assert.notEqual(validateTranslationOverrides({ 'nav.home': ' '.repeat(5) }), true)
  assert.notEqual(validateTranslationOverrides({ 'nav.home': 'a'.repeat(2001) }), true)
  assert.notEqual(validateTranslationOverrides([]), true)
  assert.notEqual(validateTranslationOverrides(null), true)
})
