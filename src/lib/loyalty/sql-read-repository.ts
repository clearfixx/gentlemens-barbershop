import type { LoyaltyReadRepository, LoyaltySnapshot } from './read-own-loyalty.ts'

/**
 * Adapter for a trusted, server-side SQL connection. Not connected to an HTTP
 * route until the loyalty tables are installed via reviewed migrations.
 * A single statement reads the balance. History is fetched separately via
 * bounded keyset pagination; never load an unbounded ledger into a snapshot.
 */
export interface LoyaltySqlClient {
  query(sql: string, parameters: readonly unknown[]): Promise<{ rows: readonly unknown[] }>
}

const CUSTOMER_SNAPSHOT_SQL = `
SELECT a.customer_id::text AS customer_id,
  a.xp::text AS xp,
  a.bonus::text AS bonus
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
      return {
        customerId,
        xp: integer(row.xp, 'xp'),
        bonus: integer(row.bonus, 'bonus'),
        history: [],
      }
    },
  }
}
