import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePublishedMessages } from './resolve-overrides.ts'
import { getFallbackMessages } from './messages/index.ts'

test('published same-locale copy overrides only the requested key', () => {
  const translated = resolvePublishedMessages('en', { locale: 'en', status: 'published', entries: { 'nav.home': 'Start page' } })
  assert.equal(translated.nav.home, 'Start page')
  assert.equal(translated.nav.catalog, getFallbackMessages('en').nav.catalog)
  assert.equal(getFallbackMessages('en').nav.home, 'Home')
})

test('draft, wrong locale and invalid payload never reach the public dictionary', () => {
  for (const record of [
    { locale: 'en', status: 'draft', entries: { 'nav.home': 'Draft' } },
    { locale: 'uk', status: 'published', entries: { 'nav.home': 'Wrong locale' } },
    { locale: 'en', status: 'published', entries: { 'unknown.key': 'Unsafe' } },
  ]) {
    assert.equal(resolvePublishedMessages('en', record).nav.home, 'Home')
  }
  assert.equal(resolvePublishedMessages('en', null).nav.home, 'Home')
})
