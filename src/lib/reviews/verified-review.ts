/** Verified-review domain rules. Customer identity and moderation cannot be supplied by the browser. */
export type NewReviewInput = { bookingId: number; rating: number; comment: string }

export class ReviewAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ReviewAccessError'
  }
}

export function parseNewReview(input: unknown): NewReviewInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReviewAccessError('Invalid review body', 400)
  const data = input as Record<string, unknown>
  if (Object.keys(data).length !== 3 || Object.keys(data).some(k => !['bookingId','rating','comment'].includes(k))) {
    throw new ReviewAccessError('Invalid review fields', 400)
  }
  if (!Number.isSafeInteger(data.bookingId) || Number(data.bookingId) <= 0) throw new ReviewAccessError('Invalid booking', 400)
  if (!Number.isInteger(data.rating) || Number(data.rating) < 1 || Number(data.rating) > 5) {
    throw new ReviewAccessError('Rating must be an integer from 1 to 5', 400)
  }
  if (typeof data.comment !== 'string') throw new ReviewAccessError('Invalid review text', 400)
  const comment = data.comment.trim()
  if (comment.length < 10 || comment.length > 1500) throw new ReviewAccessError('Review must be 10–1500 characters', 400)
  return { bookingId: Number(data.bookingId), rating: Number(data.rating), comment }
}

function id(value: unknown): number | null {
  const item = value && typeof value === 'object' && 'id' in value ? (value as {id:unknown}).id : value
  const num = typeof item === 'number' ? item : typeof item === 'string' && /^\d+$/.test(item) ? Number(item) : NaN
  return Number.isSafeInteger(num) && num > 0 ? num : null
}

export function assertReviewEligibility(booking: unknown, ownerId: number, now: Date = new Date()) {
  if (!booking || typeof booking !== 'object' || Array.isArray(booking)) throw new ReviewAccessError('Booking not found', 404)
  const data = booking as Record<string, unknown>
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || id(data.customer) !== ownerId) {
    throw new ReviewAccessError('Booking not found', 404)
  }
  const bookingId = id(data.id)
  const barberId = id(data.barber)
  if (!bookingId || !barberId || typeof data.endsAt !== 'string') throw new ReviewAccessError('Booking unavailable', 409)
  if (data.status !== 'completed' || !Number.isFinite(Date.parse(data.endsAt)) || Date.parse(data.endsAt) > now.getTime()) {
    throw new ReviewAccessError('Review requires a completed visit', 409)
  }
  return { bookingId, barberId }
}

export function isReviewUniquenessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as {code?:unknown;cause?:unknown}
  return e.code === '23505' || (e.cause ? isReviewUniquenessError(e.cause) : false)
}
