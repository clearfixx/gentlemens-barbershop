import assert from 'node:assert/strict'
import test from 'node:test'
import { AVATAR_MAX_BYTES, validateAvatarBytes } from './avatar-image.ts'

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1])
const jpeg = Uint8Array.from([255,216,255,224,0,1])
const webp = new TextEncoder().encode('RIFFxxxxWEBPVP8 ')
test('accepts only known image formats with matching binary signatures', () => {
  assert.equal(validateAvatarBytes('image/png', png).extension, 'png')
  assert.equal(validateAvatarBytes('image/jpeg', jpeg).extension, 'jpg')
  assert.equal(validateAvatarBytes('image/webp', webp).extension, 'webp')
})
test('rejects spoofed, unsupported and oversized uploads', () => {
  assert.throws(() => validateAvatarBytes('image/png', new TextEncoder().encode('<svg>')), RangeError)
  assert.throws(() => validateAvatarBytes('image/svg+xml', png), RangeError)
  assert.throws(() => validateAvatarBytes('image/jpeg', new Uint8Array()), RangeError)
  assert.throws(() => validateAvatarBytes('image/png', new Uint8Array(AVATAR_MAX_BYTES + 1)), RangeError)
})
