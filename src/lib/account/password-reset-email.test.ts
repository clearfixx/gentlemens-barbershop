import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPasswordResetEmail } from './password-reset-email.ts'

test('reset email encodes opaque token, including HTML-sensitive characters', () => {
  const html = buildPasswordResetEmail('a&"<>', 'https://example.com', true)
  assert.match(html, /https:\/\/example\.com\/uk\/auth\/reset-password\?token=a%26%22%3C%3E/)
  assert.doesNotMatch(html, /a&"<>/)
})

test('reset email rejects unsafe origins or missing tokens', () => {
  assert.throws(() => buildPasswordResetEmail(undefined, 'https://example.com', true))
  assert.throws(() => buildPasswordResetEmail('abc', 'http://example.com', true), /HTTPS/)
  assert.throws(() => buildPasswordResetEmail('abc', 'https://user:pw@example.com', true))
  assert.throws(() => buildPasswordResetEmail('abc', 'javascript:alert(1)', false))
})
