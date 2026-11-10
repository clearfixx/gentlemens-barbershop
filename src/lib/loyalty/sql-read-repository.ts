import type { LoyaltyReadRepository, LoyaltySnapshot, LoyaltyHistoryItem } from './read-own-loyalty.ts'

/**
 * Adapter for a trusted, server-side SQL connection. Not connected to an HTTP
 * route until the loyalty tables are installed via reviewed migrations.
 * A single statement reads balances and history from one MVCC snapshot.
 */
export interface LoyaltySqlClient {
  query(sql: string, parameters: readonly unknown[]): Promise<{ rows: readonly unknown[] }>
}

const CUSTOMER_SNAPSHOT_SQL = `
SELECT a.customer_id::text AS customer_id, a.xp::text AS xp, a.bonus::text AS bonus,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', e.id::text,
      'kind', e.kind,
      'xpDelta', e.xp_delta::text,
      'bonusDelta', e.bonus_delta::text,
      'source', e.source,
      'createdAt', to_char(e.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY e.id)
    FROM loyalty_entries e WHERE e.customer_id = a.customer_id),
    '[]'::jsonb
  ) AS history
FROM loyalty_accounts a
WHERE a.customer_id = $1::bigint
`

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid loyalty database response')
  }
  return value as Record<string, unknown>
}

function integer(value: unknown, field: string, allowNegative = false): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Invalid loyalty ${field}`)
  }
  if (typeof value === 'string' && !/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`Invalid loyalty ${field}`)
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result) || (!allowNegative && result < 0)) {
    throw new Error(`Invalid loyalty ${field}`)
  }
  return result
}

function historyItem(value: unknown): LoyaltyHistoryItem {
  const row = record(value)
  if (typeof row.id !== 'string' || !/^[1-9][0-9]*$/.test(row.id) ||
    (row.kind !== 'earn' && row.kind !== 'redeem' && row.kind !== 'reverse') ||
    typeof row.source !== 'string' || !row.source.trim() ||
    typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new Error('Invalid loyalty history entry')
  }
  return {
    id: row.id,
    kind: row.kind,
    xpDelta: integer(row.xpDelta, 'history xp delta', true),
    bonusDelta: integer(row.bonusDelta, 'history bonus delta', true),
    source: row.source,
    createdAt: row.createdAt,
  }
}

export function createLoyaltySqlReadRepository(client: LoyaltySqlClient): LoyaltyReadRepository {
  return {
    async findCustomerSnapshot(customerId: string): Promise<LoyaltySnapshot | null> {
      if (!/^[1-9][0-9]*$/.test(customerId) ||
        !Number.isSafeInteger(Number(customerId))) {
        throw new Error('Invalid authenticated customer identifier')
      }
      const result = await client.query(CUSTOMER_SNAPSHOT_SQL, [customerId])
      if (result.rows.length === 0) return null
      if (result.rows.length !== 1) throw new Error('Duplicate loyalty accounts')
      const row = record(result.rows[0])
      if (row.customer_id !== customerId) {
        throw new Error('Loyalty repository customer mismatch')
      }
      if (!Array.isArray(row.history)) throw new Error('Invalid loyalty history')
      return {
        customerId,
        xp: integer(row.xp, 'xp'),
        bonus: integer(row.bonus, 'bonus'),
        history: row.history.map(historyItem),
      }
    },
  }
}
