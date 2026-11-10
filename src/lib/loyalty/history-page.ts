import type { LoyaltyPrincipal, LoyaltyHistoryItem } from './read-own-loyalty.ts'
import type { LoyaltySqlClient } from './sql-read-repository.ts'
import { authenticatedCustomerId } from './read-own-loyalty.ts'

export type LoyaltyHistoryPage = {
  entries: readonly LoyaltyHistoryItem[]
  nextCursor: string | null
}
export const MAX_LOYALTY_PAGE_SIZE = 50

/** Keyset pagination, scoped to the trusted authenticated customer. */
export async function getOwnLoyaltyHistoryPage(
  principal: LoyaltyPrincipal,
  client: LoyaltySqlClient,
  options: { limit?: number; before?: string } = {},
): Promise<LoyaltyHistoryPage> {
  const customerId = authenticatedCustomerId(principal)
  const limit = options.limit ?? 20
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LOYALTY_PAGE_SIZE) {
    throw new RangeError('Invalid loyalty page size')
  }
  const before = options.before
  if (before !== undefined && (!/^[1-9][0-9]*$/.test(before) ||
    !Number.isSafeInteger(Number(before)))) {
    throw new RangeError('Invalid loyalty cursor')
  }

  const result = await client.query(`
    SELECT id::text AS id, kind, xp_delta::text AS xp_delta,
      bonus_delta::text AS bonus_delta, source,
      to_char(created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
    FROM loyalty_entries
    WHERE customer_id = $1::bigint
      AND ($2::bigint IS NULL OR id < $2::bigint)
    ORDER BY id DESC
    LIMIT $3::integer
  `, [customerId, before ?? null, limit + 1])

  if (result.rows.length > limit + 1) throw new Error('Unexpected loyalty page length')
  let previousId = before === undefined ? null : BigInt(before)
  const items = result.rows.map((value): LoyaltyHistoryItem => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid loyalty entry')
    }
    const row = value as Record<string, unknown>
    if (typeof row.id !== 'string' || !/^[1-9][0-9]*$/.test(row.id) ||
      !Number.isSafeInteger(Number(row.id)) ||
      (row.kind !== 'earn' && row.kind !== 'redeem' && row.kind !== 'reverse') ||
      typeof row.source !== 'string' || !row.source.trim() ||
      typeof row.created_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.created_at) ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      new Date(row.created_at).toISOString() !== row.created_at) {
      throw new Error('Invalid loyalty entry')
    }
    const entryId = BigInt(row.id)
    if (previousId !== null && entryId >= previousId) {
      throw new Error('Loyalty history order or cursor violation')
    }
    previousId = entryId
    const xpDelta = Number(row.xp_delta)
    const bonusDelta = Number(row.bonus_delta)
    if (!Number.isSafeInteger(xpDelta) || !Number.isSafeInteger(bonusDelta) ||
      !/^-?(0|[1-9][0-9]*)$/.test(String(row.xp_delta)) ||
      !/^-?(0|[1-9][0-9]*)$/.test(String(row.bonus_delta))) {
      throw new Error('Invalid loyalty delta')
    }
    return {
      id: row.id, kind: row.kind, xpDelta, bonusDelta,
      source: row.source, createdAt: row.created_at,
    }
  })
  const hasMore = items.length > limit
  const entries = hasMore ? items.slice(0, limit) : items
  return {
    entries,
    nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
  }
}
