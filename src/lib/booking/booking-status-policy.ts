export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type BookingActor = 'customer' | 'assigned_barber' | 'admin'

export type TransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'forbidden' | 'invalid_transition' | 'too_early' | 'deadline_passed' }

const terminalStatuses: ReadonlySet<BookingStatus> = new Set(['completed', 'cancelled', 'no_show'])

/**
 * Authorization and state-machine decision only. Persistence must re-check
 * the source state inside a transaction before applying the transition.
 */
export function decideBookingTransition(input: {
  actor: BookingActor
  from: BookingStatus
  to: BookingStatus
  startsAt: string | Date
  now: Date
  customerCancellationAllowed: boolean
}): TransitionDecision {
  const { actor, from, to, customerCancellationAllowed } = input
  if (terminalStatuses.has(from) || from === to) {
    return { allowed: false, reason: 'invalid_transition' }
  }
  if (actor === 'customer') {
    if (to !== 'cancelled' || (from !== 'pending' && from !== 'confirmed')) {
      return { allowed: false, reason: 'forbidden' }
    }
    return customerCancellationAllowed
      ? { allowed: true }
      : { allowed: false, reason: 'deadline_passed' }
  }

  if (from === 'pending' && (to === 'confirmed' || to === 'cancelled')) {
    return { allowed: true }
  }
  if (from === 'confirmed' && to === 'cancelled') {
    return { allowed: true }
  }
  if (from === 'confirmed' && (to === 'completed' || to === 'no_show')) {
    const start = new Date(input.startsAt).getTime()
    const now = input.now.getTime()
    if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) {
      return { allowed: false, reason: 'too_early' }
    }
    return { allowed: true }
  }
  return { allowed: false, reason: 'invalid_transition' }
}
