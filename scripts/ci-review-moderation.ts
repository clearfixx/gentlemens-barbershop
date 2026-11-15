import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

/**
 * CI-only moderation rehearsal. Uses the fresh isolated PostgreSQL instance
 * after browser submissions, never production or a real account.
 */
if (process.env.CI !== 'true' || !process.env.DATABASE_URL?.includes('localhost')) {
  throw new Error('Review moderation rehearsal requires isolated local CI PostgreSQL')
}

const payload = await getPayload({ config })
const pending = await payload.find({
  collection: 'reviews', overrideAccess: true, depth: 0,
  where: { status: { equals: 'pending' } }, limit: 5,
})
assert.equal(pending.docs.length, 1, 'Only one submitted review should exist')
const review = pending.docs[0]
assert.equal(review.rating, 5)
assert.match(review.comment, /стрижка/)
const published = await payload.update({
  collection: 'reviews', id: review.id, overrideAccess: true,
  data: { status: 'published' },
})
assert.equal(published.status, 'published')
assert.ok(published.publishedAt, 'Publishing must set a server timestamp')
const publicReview = await payload.find({
  collection: 'reviews', overrideAccess: false, depth: 0,
  where: { id: { equals: review.id } }, limit: 1,
})
assert.equal(publicReview.docs.length, 1, 'Published review should be public')
await assert.rejects(() => payload.update({
  collection: 'reviews', id: review.id, overrideAccess: true,
  data: { rating: 1 },
}), 'Moderation must not rewrite the customer rating')
await assert.rejects(() => payload.create({
  collection: 'reviews', overrideAccess: true,
  data: {
    booking: review.booking, customer: review.customer, barber: review.barber,
    rating: 4, comment: 'Attempt to create a second review for one booking', status: 'pending',
  },
}), 'PostgreSQL must reject a second review for the same booking')
console.log('CI REVIEWS MODERATION OK: published-only public read, immutable score and unique booking')
process.exit(0)
