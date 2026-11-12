/**
 * Customer-scoped loyalty read model. Never accept a customer ID from a
 * request query or body: the authenticated principal determines the scope.
 * The repository is injected so the domain can be tested without Payload.
 */
export type LoyaltyPrincipal = { id: string | number; role: string } | null
export type LoyaltyHistoryItem = {
  id: string
  kind: 'earn' | 'redeem' | 'reverse'
  xpDelta: number
  bonusDelta: number
  source: string
  createdAt: string
}
export type LoyaltySnapshot = {
  customerId: string
  xp: number
  bonus: number
  history: readonly LoyaltyHistoryItem[]
}
export interface LoyaltyReadRepository {
  findCustomerSnapshot(customerId: string): Promise<LoyaltySnapshot | null>
}

export class LoyaltyAccessError extends Error {
  constructor() {
    super('Customer authentication required')
    this.name = 'LoyaltyAccessError'
  }
}

/** Shared trusted-principal validation for balance and history reads. */
export function authenticatedCustomerId(principal: LoyaltyPrincipal): string {
  if (!principal || principal.role !== 'customer' ||
    (typeof principal.id !== 'string' && typeof principal.id !== 'number') ||
    !/^[1-9][0-9]*$/.test(String(principal.id)) ||
    !Number.isSafeInteger(Number(principal.id))) {
    throw new LoyaltyAccessError()
  }
  return String(principal.id)
}

export async function getOwnLoyalty(
  principal: LoyaltyPrincipal,
  repository: LoyaltyReadRepository,
): Promise<LoyaltySnapshot> {
  const customerId = authenticatedCustomerId(principal)
  const snapshot = await repository.findCustomerSnapshot(customerId)
  if (!snapshot) return { customerId, xp: 0, bonus: 0, history: [] }
  if (snapshot.customerId !== customerId) {
    throw new Error('Repository returned another customer account')
  }
  if (!Number.isSafeInteger(snapshot.xp) || snapshot.xp < 0 ||
    !Number.isSafeInteger(snapshot.bonus) || snapshot.bonus < 0) {
    throw new Error('Invalid loyalty balance returned from storage')
  }
  return snapshot
}
