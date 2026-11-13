import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../src/payload.config.ts'
import { up } from '../src/migrations/20261112_060000_booking_shared_rate_limit.ts'

/**
 * The regular Payload push-mode CI database has no migration ledger.
 * Use the exact committed managed limiter migration here rather than
 * weakening the HTTP route or duplicating production SQL in test fixtures.
 * This is strictly guarded to the disposable local CI PostgreSQL instance.
 */
async function main() {
  assert.equal(process.env.CI, 'true')
  assert.equal(process.env.NODE_ENV, 'development')
  assert.equal(process.env.BOOKING_WRITE_TEST_MODE, 'enabled')
  assert.equal(
    process.env.DATABASE_URL,
    'postgresql://postgres:postgres@localhost:5432/gentlemens_barbershop',
    'Refusing to initialize limiter outside the disposable CI database',
  )
  const payload = await getPayload({ config })
  await up({ db: payload.db.drizzle } as Parameters<typeof up>[0])
  const result = await payload.db.drizzle.execute(sql`
    SELECT to_regprocedure('booking_rate_limit_consume(text,bigint,bigint,integer)') IS NOT NULL AS installed
  `)
  assert.equal(result.rows[0]?.installed, true)
  console.log('STAGING LIMITER OK: committed shared-limiter migration installed on disposable DB')
}
// CI-only one-shot setup. Payload's Postgres pool otherwise keeps the Node
// event loop open after the migration has completed and verified.
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
