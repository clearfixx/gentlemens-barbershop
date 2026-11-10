/**
 * Loyalty accounting: XP is permanent progress unless an earning is reversed.
 * Bonuses are spendable units. Persistence must enforce unique event IDs and
 * idempotency keys atomically; this pure projection is not a transaction layer.
 */
export type LoyaltyEvent =
  | { kind: 'earn'; xp: number; bonus: number; source: string }
  | { kind: 'redeem'; bonus: number; source: string }
  | { kind: 'reverse'; originalEventId: string; source: string }

export type LoyaltyEntry = {
  id: string
  customerId: string
  idempotencyKey: string
  event: LoyaltyEvent
}

export type LoyaltyBalance = { xp: number; bonus: number }

function safeNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
}

function safeSum(left: number, right: number, name: string): number {
  const sum = left + right
  safeNonNegative(sum, name)
  return sum
}

/** Project ordered ledger entries for exactly one customer. */
export function projectLoyalty(entries: readonly LoyaltyEntry[]): LoyaltyBalance {
  const ids = new Set<string>()
  const keys = new Set<string>()
  const previous = new Map<string, LoyaltyEntry>()
  const reversed = new Set<string>()
  let customerId: string | undefined
  let xp = 0
  let bonus = 0

  for (const entry of entries) {
    if (!entry.id.trim() || !entry.customerId.trim() || !entry.idempotencyKey.trim() ||
      !entry.event.source.trim()) {
      throw new Error('Loyalty entry requires id, customer, idempotency key and source')
    }
    if (customerId !== undefined && entry.customerId !== customerId) {
      throw new Error('Cannot project entries for different customers')
    }
    customerId = entry.customerId
    if (ids.has(entry.id) || keys.has(entry.idempotencyKey)) {
      throw new Error('Duplicate loyalty entry or idempotency key')
    }
    ids.add(entry.id)
    keys.add(entry.idempotencyKey)

    const event = entry.event
    if (event.kind === 'earn') {
      safeNonNegative(event.xp, 'xp')
      safeNonNegative(event.bonus, 'bonus')
      xp = safeSum(xp, event.xp, 'xp')
      bonus = safeSum(bonus, event.bonus, 'bonus')
    } else if (event.kind === 'redeem') {
      safeNonNegative(event.bonus, 'bonus')
      if (event.bonus > bonus) throw new Error('Insufficient bonus balance')
      bonus -= event.bonus
    } else {
      const original = previous.get(event.originalEventId)
      if (!original || original.event.kind === 'reverse' || reversed.has(original.id)) {
        throw new Error('Reversal must reference a prior unreversed earn or redeem event')
      }
      if (original.event.kind === 'earn') {
        if (original.event.xp > xp || original.event.bonus > bonus) {
          throw new Error('Cannot reverse already spent rewards')
        }
        xp -= original.event.xp
        bonus -= original.event.bonus
      } else {
        bonus = safeSum(bonus, original.event.bonus, 'bonus')
      }
      reversed.add(original.id)
    }
    previous.set(entry.id, entry)
  }
  return { xp, bonus }
}
