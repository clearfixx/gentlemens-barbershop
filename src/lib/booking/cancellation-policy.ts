/**
 * Cancellation policy is resolved from the booking's location on the server.
 * Do not accept a client-provided deadline as authoritative.
 */
export const DEFAULT_CANCELLATION_DEADLINE_MINUTES = 60

export function isValidCancellationDeadlineMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10080
}

/**
 * The field may be absent on pre-migration location records.
 * Invalid persisted values fail closed rather than silently relaxing policy.
 */
export function resolveCancellationDeadlineMinutes(value: unknown): number {
  if (value === null || value === undefined) return DEFAULT_CANCELLATION_DEADLINE_MINUTES
  if (!isValidCancellationDeadlineMinutes(value)) {
    throw new Error('Invalid location cancellation policy')
  }
  return value
}

export function canCustomerCancelBooking(input: {
  startsAt: string | Date
  now: Date
  deadlineMinutes: number
}): boolean {
  if (!isValidCancellationDeadlineMinutes(input.deadlineMinutes)) return false
  const startsAt = new Date(input.startsAt).getTime()
  const now = input.now.getTime()
  if (!Number.isFinite(startsAt) || !Number.isFinite(now)) return false
  return startsAt - now >= input.deadlineMinutes * 60_000
}
