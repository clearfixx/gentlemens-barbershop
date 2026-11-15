import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProfilePhone } from './profile-phone.ts'

test('optional profile phone accepts common domestic and international numbers', () => {
  for (const value of ['', undefined, null, '+380 67 123 45 67', '(044) 555-12-34', '0445551234', '+1 (415) 555-2671']) {
    assert.equal(validateProfilePhone(value), true, String(value))
  }
})
test('profile phone rejects malformed input and invalid punctuation', () => {
  for (const value of ['abcdefg', '123', '+380-ABC-123', '7'.repeat(33), {},
    '++380671234567', '+380 (67 1234567', '(044)) 555-12-34',
    '(04x) 555-12-34', ' 0445551234 ', '-0445551234', '+380-67123-']) {
    assert.equal(validateProfilePhone(value), 'Invalid phone number', String(value))
  }
})
