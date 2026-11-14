import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProfilePhone } from './profile-phone.ts'

test('optional profile phone accepts realistic numbers', () => {
  for (const value of ['', undefined, '+380 67 123 45 67', '(044) 555-12-34']) {
    assert.equal(validateProfilePhone(value), true)
  }
})
test('profile phone rejects malformed values', () => {
  for (const value of ['abcdefg', '123', '+380-ABC-123', '7'.repeat(33), {}, '++380671234567']) {
    assert.equal(validateProfilePhone(value), 'Invalid phone number')
  }
})
