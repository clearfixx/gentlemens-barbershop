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

function dictionaryShape(value: unknown, prefix = ''): Map<string, string> {
  const shape = new Map<string, string>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return shape
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') {
      assert.ok(child.trim().length > 0, `Empty translation: ${path}`)
      shape.set(path, 'string')
    } else if (Array.isArray(child)) {
      assert.ok(child.length > 0, `Empty translation array: ${path}`)
      assert.ok(child.every(item => typeof item === 'string' && item.trim()), `Invalid translation array: ${path}`)
      shape.set(path, `array:${child.length}`)
    } else {
      assert.ok(child && typeof child === 'object', `Unsupported dictionary entry: ${path}`)
      for (const [nestedPath, kind] of dictionaryShape(child, path)) shape.set(nestedPath, kind)
    }
  }
  return shape
}

test('UK and EN dictionaries have identical complete key and array shapes', () => {
  const uk = dictionaryShape(getFallbackMessages('uk'))
  const en = dictionaryShape(getFallbackMessages('en'))
  assert.deepEqual([...en.entries()].sort(), [...uk.entries()].sort())
})
