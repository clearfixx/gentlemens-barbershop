import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFallbackMessages } from './index.ts'

test('every supported locale returns a complete home and SEO dictionary', () => {
  for (const locale of ['uk', 'en'] as const) {
    const t = getFallbackMessages(locale)
    assert.ok(t.home?.eyebrow, `${locale}: home.eyebrow`)
    assert.ok(t.home?.heroIntro, `${locale}: home.heroIntro`)
    assert.ok(t.catalog?.title, `${locale}: catalog.title`)
    assert.ok(t.booking?.intro, `${locale}: booking.intro`)
    assert.ok(t.availability?.intro, `${locale}: availability.intro`)
  }
})
