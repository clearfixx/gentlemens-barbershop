import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

/**
 * Disposable production-server browser fixture, never pointed at real data.
 * All records belong to a fresh CI-only customer and use isolated future/past
 * appointment dates. Do not print email, password or tokens into CI logs.
 */
if (process.env.CI !== 'true' || !process.env.DATABASE_URL?.includes('localhost')) {
  throw new Error('Populated account fixture requires isolated local CI PostgreSQL')
}
const payload = await getPayload({ config })
const nonce = randomUUID().replaceAll('-', '')
const password = 'ci-only-populated-Password-2026!'
const email = 'populated-' + nonce + '@example.invalid'
const fullName = 'Populated Customer'
const customer = await payload.create({
  collection: 'users',
  overrideAccess: true,
  data: { email, displayName: fullName, password, role: 'customer' },
})
const foreign = await payload.create({
  collection: 'users',
  overrideAccess: true,
  data: { email: 'other-' + nonce + '@example.invalid', displayName: 'Other Customer',
    password, role: 'customer' },
})
const location = await payload.create({
  collection: 'locations', overrideAccess: true,
  data: { name: 'CI Gentlemen Studio', slug: 'ci-studio-' + nonce,
    city: 'Kyiv', address: 'CI Test Street 1', isActive: true },
})
const service = await payload.create({
  collection: 'services', overrideAccess: true,
  data: { name: 'CI Classic Haircut', slug: 'ci-haircut-' + nonce,
    durationMinutes: 45, price: 650, isActive: true },
})
const barber = await payload.create({
  collection: 'barbers', overrideAccess: true,
  data: { name: 'CI Barber Leon', slug: 'ci-leon-' + nonce, location: location.id,
    isActive: true, serviceOfferings: [{ service: service.id }] },
})
// Give the CI barber a real uploaded image to exercise Payload Media -> barber
// portrait -> dashboard <Image> rendering, not just the text-only fallback.
const image = readFileSync('public/images/hero/barbershop-interior.webp')
const portrait = await payload.create({
  collection: 'media',
  overrideAccess: true,
  data: { alt: 'CI barber photograph fixture' },
  file: {
    data: image, size: image.length,
    name: 'ci-dashboard-portrait-' + nonce + '.webp', mimetype: 'image/webp',
  },
})
await payload.update({
  collection: 'barbers', id: barber.id, overrideAccess: true,
  data: { portrait: portrait.id },
})
const now = Date.now()
function day(offset: number): string {
  const date = new Date(now + offset * 86_400_000)
  return date.toISOString()
}
async function book(offset: number, ownerId = customer.id) {
  const start = day(offset)
  const end = new Date(Date.parse(start) + 45 * 60_000).toISOString()
  const entry = await payload.create({
    collection: 'bookings', overrideAccess: true,
    data: {
      location: location.id, barber: barber.id, services: [service.id],
      customer: ownerId, customerName: ownerId === customer.id ? fullName : 'Other Customer',
      customerPhone: '+380671234567',
      startsAt: start, endsAt: end, totalPrice: 650, status: 'pending',
    },
  })
  return { id: entry.id, startsAt: start }
}
async function status(id: number | string, next: 'confirmed' | 'cancelled' | 'completed') {
  await payload.update({ collection: 'bookings', id, overrideAccess: true,
    data: { status: next } })
}
const first = await book(2)
const second = await book(4)
await status(second.id, 'confirmed')
const cancelledFuture = await book(6)
await status(cancelledFuture.id, 'cancelled')
const completedPast = await book(-3)
await status(completedPast.id, 'confirmed')
await status(completedPast.id, 'completed')
const cancelledPast = await book(-5)
await status(cancelledPast.id, 'cancelled')
const foreignBooking = await book(8, foreign.id)
assert.ok(first.id !== second.id && first.id !== foreignBooking.id)

writeFileSync('/tmp/barbershop-populated-account.json', JSON.stringify({
  email, password, name: fullName,
  bookings: {
    first, second, cancelledFuture, completedPast, cancelledPast, foreignBooking,
  },
}), { mode: 0o600 })
console.log('CI POPULATED ACCOUNT FIXTURE OK: five owned bookings, one foreign, lifecycle transitions')
process.exit(0)
