import assert from 'node:assert/strict'
import test from 'node:test'
import { ReviewAccessError, assertReviewEligibility, isReviewUniquenessError, parseNewReview } from './verified-review.ts'

test('review input validates rating, length, and disallows forged fields', () => {
  assert.deepEqual(parseNewReview({bookingId:17,rating:5,comment:'  Excellent haircut and service!  '}),
    {bookingId:17,rating:5,comment:'Excellent haircut and service!'})
  for (const value of [
    {bookingId:17,rating:0,comment:'Excellent service!'},
    {bookingId:17,rating:6,comment:'Excellent service!'},
    {bookingId:17,rating:4.5,comment:'Excellent service!'},
    {bookingId:-1,rating:5,comment:'Excellent service!'},
    {bookingId:17,rating:5,comment:'short'},
    {bookingId:17,rating:5,comment:'a'.repeat(1501)},
    {bookingId:17,rating:5,comment:'Excellent service!',status:'published'},
    {bookingId:17,rating:5,comment:'Excellent service!',customer:2},
  ]) assert.throws(() => parseNewReview(value), ReviewAccessError)
})
test('only the account owner after a completed visit may review', () => {
  const booking={id:17,customer:4,barber:11,status:'completed',endsAt:'2026-11-01T10:00:00.000Z'}
  const now=new Date('2026-11-15T12:00:00.000Z')
  assert.deepEqual(assertReviewEligibility(booking,4,now),{bookingId:17,barberId:11})
  assert.throws(() => assertReviewEligibility(booking,5,now),(e:unknown)=>e instanceof ReviewAccessError && e.status===404)
  assert.throws(() => assertReviewEligibility({...booking,status:'confirmed'},4,now),ReviewAccessError)
  assert.throws(() => assertReviewEligibility({...booking,endsAt:'2026-12-01T10:00:00.000Z'},4,now),ReviewAccessError)
})
test('database uniqueness is identified by SQLSTATE', () => {
  assert.equal(isReviewUniquenessError({code:'23505'}),true)
  assert.equal(isReviewUniquenessError({cause:{code:'23505'}}),true)
  assert.equal(isReviewUniquenessError({code:'23503'}),false)
})
