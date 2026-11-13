import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

const CODE_PATTERN = /^[0-9]{8}$/
const CODE_TTL_MINUTES = 15
const MAX_ATTEMPTS = 5

export class GuestCancellationConflictError extends Error {
  constructor() {
    super('Guest cancellation cannot be verified')
    this.name = 'GuestCancellationConflictError'
  }
}

export function parseGuestCancellationRequest(body: unknown): { bookingId: number; email: string } {
  const input = parseFields(body, ['bookingId', 'email'])
  const bookingId = positiveId(input.bookingId)
  if (typeof input.email !== 'string' || input.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new RangeError('Invalid cancellation request')
  }
  return { bookingId, email: input.email.trim().toLowerCase() }
}

export function parseGuestCancellationConfirmation(body: unknown): { bookingId: number; code: string } {
  const input = parseFields(body, ['bookingId', 'code'])
  const bookingId = positiveId(input.bookingId)
  if (typeof input.code !== 'string' || !CODE_PATTERN.test(input.code)) {
    throw new RangeError('Invalid cancellation confirmation')
  }
  return { bookingId, code: input.code }
}

function parseFields(body: unknown, names: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RangeError('Invalid cancellation body')
  }
  const input = body as Record<string, unknown>
  const actual = Object.keys(input)
  if (actual.length !== names.length || actual.some(field => !names.includes(field))) {
    throw new RangeError('Invalid cancellation fields')
  }
  return input
}

function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('Invalid cancellation booking identifier')
  }
  return value
}

export function cancellationCodeHash(bookingId: number, code: string, secret: string): string {
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !CODE_PATTERN.test(code) ||
      typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Guest cancellation verification unavailable')
  }
  return createHmac('sha256', secret).update('guest-cancel-v1:').update(String(bookingId))
    .update(':').update(code).digest('hex')
}

export function guestCancellationDeliveryConfigured(environment: {
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  PAYLOAD_SECRET?: string
}): boolean {
  return typeof environment.RESEND_API_KEY === 'string' &&
    environment.RESEND_API_KEY.length >= 16 &&
    typeof environment.RESEND_FROM_EMAIL === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.RESEND_FROM_EMAIL) &&
    typeof environment.PAYLOAD_SECRET === 'string' &&
    environment.PAYLOAD_SECRET.length >= 32
}

/** Provider errors intentionally contain no recipient email, request data or code. */
export async function deliverGuestCancellationCode(input: {
  email: string
  code: string
  apiKey: string
  from: string
  send?: typeof fetch
}): Promise<void> {
  const send = input.send ?? fetch
  const response = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.from,
      to: [input.email],
      subject: 'Gentlemen’s Barbershop — код скасування запису',
      text: `Код підтвердження скасування: ${input.code}. Він дійсний 15 хвилин. Якщо ви не запитували скасування, проігноруйте цей лист.`,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('Guest cancellation delivery unavailable')
}

/**
 * Generic non-enumerating request. The recipient is always the stored contact
 * email of an eligible accountless booking; input email must match it.
 * One challenge per booking, at most one issued every 5 minutes.
 */
export async function requestGuestCancellation(input: {
  payload: Pick<Payload, 'db'>
  bookingId: number
  email: string
  secret: string
  deliver: (email: string, code: string) => Promise<void>
  code?: string
}): Promise<void> {
  const code = input.code ?? String(randomInt(0, 100_000_000)).padStart(8, '0')
  const digest = cancellationCodeHash(input.bookingId, code, input.secret)
  const result = await input.payload.db.drizzle.execute(sql`
    INSERT INTO booking_guest_cancellation_challenges
      (booking_id, code_hash, issued_at, expires_at, attempts, consumed_at)
    SELECT booking.id, ${digest}, NOW(), NOW() + INTERVAL '15 minutes', 0, NULL
    FROM bookings booking
    JOIN locations location ON location.id = booking.location_id
    WHERE booking.id = ${input.bookingId}
      AND booking.customer_id IS NULL
      AND booking.customer_email IS NOT NULL
      AND lower(booking.customer_email) = ${input.email}
      AND booking.status IN ('pending', 'confirmed')
      AND booking.starts_at > NOW() +
        (location.cancellation_deadline_minutes * INTERVAL '1 minute')
    ON CONFLICT (booking_id) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      issued_at = EXCLUDED.issued_at,
      expires_at = EXCLUDED.expires_at,
      attempts = 0,
      consumed_at = NULL
    WHERE booking_guest_cancellation_challenges.issued_at < NOW() - INTERVAL '5 minutes'
      AND booking_guest_cancellation_challenges.consumed_at IS NULL
    RETURNING booking_id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new Error('Invalid guest cancellation challenge response')
  }
  if (result.rows.length === 1) {
    // Never deliver to the user-supplied address unless DB verified equality.
    await input.deliver(input.email, code)
  }
}

/**
 * Row-lock challenge, count failed attempts and perform cancellation plus
 * guest audit in a single transaction. Bad codes still commit the attempt.
 * A code is consumed once and cannot cancel a second booking.
 */
export async function confirmGuestCancellation(input: {
  payload: Pick<Payload, 'db'>
  bookingId: number
  code: string
  secret: string
}): Promise<{ id: number; status: 'cancelled' }> {
  const hash = cancellationCodeHash(input.bookingId, input.code, input.secret)
  const outcome = await input.payload.db.drizzle.transaction(async tx => {
    const challenges = await tx.execute(sql`
      SELECT code_hash, attempts
      FROM booking_guest_cancellation_challenges
      WHERE booking_id = ${input.bookingId}
        AND consumed_at IS NULL AND expires_at > NOW() AND attempts < ${MAX_ATTEMPTS}
      FOR UPDATE
    `)
    const challenge = challenges.rows[0]
    if (!challenge || typeof challenge.code_hash !== 'string' ||
        !Number.isInteger(challenge.attempts)) return false

    const stored = Buffer.from(challenge.code_hash, 'hex')
    const actual = Buffer.from(hash, 'hex')
    if (stored.length !== actual.length || !timingSafeEqual(stored, actual)) {
      await tx.execute(sql`
        UPDATE booking_guest_cancellation_challenges
        SET attempts = attempts + 1 WHERE booking_id = ${input.bookingId}
      `)
      return false
    }

    const changed = await tx.execute(sql`
      WITH eligible AS MATERIALIZED (
        SELECT b.id, b.status
        FROM bookings b JOIN locations loc ON loc.id = b.location_id
        WHERE b.id = ${input.bookingId}
          AND b.customer_id IS NULL AND b.customer_email IS NOT NULL
          AND b.status IN ('pending', 'confirmed')
          AND b.starts_at > NOW() +
            (loc.cancellation_deadline_minutes * INTERVAL '1 minute')
        FOR UPDATE OF b
      ), changed AS (
        UPDATE bookings b
        SET status = 'cancelled', updated_at = NOW()
        FROM eligible WHERE b.id = eligible.id AND b.status = eligible.status
        RETURNING b.id, eligible.status AS previous_status
      ), recorded AS (
        INSERT INTO booking_events
          (booking_id, action, previous_status, actor_id, actor_role, reason, created_at, updated_at)
        SELECT id, 'cancelled'::public.enum_booking_events_action,
          previous_status::text::public.enum_booking_events_previous_status,
          NULL, 'guest'::public.enum_booking_events_actor_role,
          'Verified guest email challenge', NOW(), NOW()
        FROM changed RETURNING booking_id
      )
      SELECT changed.id FROM changed JOIN recorded ON recorded.booking_id = changed.id
    `)
    if (!Array.isArray(changed.rows) || changed.rows.length > 1) {
      throw new Error('Invalid cancellation update result')
    }
    if (changed.rows.length !== 1 || Number(changed.rows[0]?.id) !== input.bookingId) return false
    await tx.execute(sql`
      UPDATE booking_guest_cancellation_challenges
      SET consumed_at = NOW() WHERE booking_id = ${input.bookingId}
    `)
    return true
  })
  if (!outcome) throw new GuestCancellationConflictError()
  return { id: input.bookingId, status: 'cancelled' }
}
