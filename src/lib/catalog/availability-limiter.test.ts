import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FixedWindowLimiter, requestRateLimitKey } from './availability-limiter.ts'

test('allows only the configured number of requests per window', () => {
  const limiter = new FixedWindowLimiter(2, 1000, 2)
  assert.deepEqual(limiter.check('a', 100), { allowed: true, retryAfterSeconds: 0 })
  assert.deepEqual(limiter.check('a', 200), { allowed: true, retryAfterSeconds: 0 })
  assert.deepEqual(limiter.check('a', 300), { allowed: false, retryAfterSeconds: 1 })
  assert.deepEqual(limiter.check('a', 1100), { allowed: true, retryAfterSeconds: 0 })
})

test('limits memory and fails closed for new keys until a window expires', () => {
  const limiter = new FixedWindowLimiter(2, 1000, 1)
  assert.equal(limiter.check('a', 0).allowed, true)
  assert.equal(limiter.check('b', 100).allowed, false)
  assert.equal(limiter.check('b', 1001).allowed, true)
})

test('does not trust spoofable forwarded headers for worker-wide quota', () => {
  const one = new Request('http://localhost/api/availability', {
    headers: { 'user-agent': 'one', 'x-forwarded-for': '1.2.3.4' },
  })
  const two = new Request('http://localhost/api/availability', {
    headers: { 'user-agent': 'two', 'x-forwarded-for': '5.6.7.8' },
  })
  assert.equal(requestRateLimitKey(one), requestRateLimitKey(two))
})
