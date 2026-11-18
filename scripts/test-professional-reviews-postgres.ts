import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { loadProfessionalReviewQueue } from '../src/lib/admin/professional-review-queue.ts'

/** Isolated PostgreSQL schema and default privacy smoke check.
 * Does not create artificial published content or bypass the approval workflow.
 */
async function run() {
  if (process.env.ADMIN_APPROVAL_INTEGRATION !== 'isolated') {
    throw new Error('Professional reviews test requires a disposable migrated database')
  }
  const payload = await getPayload({ config })
  const rows = await payload.db.drizzle.execute(
    // Live SQL smoke: required table, indexes, and enum must already exist.
    (await import('@payloadcms/db-postgres')).sql`
      SELECT
        to_regclass('public.barber_profile_revisions') IS NOT NULL AS has_table,
        to_regclass('public.barber_profile_revisions_status_idx') IS NOT NULL AS has_status_index,
        to_regtype('public.enum_barber_profile_revisions_status') IS NOT NULL AS has_status_enum
    `,
  )
  assert.equal(rows.rows[0]?.has_table, true)
  assert.equal(rows.rows[0]?.has_status_index, true)
  assert.equal(rows.rows[0]?.has_status_enum, true)
  const admin = { userId: 1, role: 'admin' as const, locationIds: [] }
  const scoped = { userId: 2, role: 'location_admin' as const, locationIds: [2147483600] }
  const emptyNetwork = await loadProfessionalReviewQueue(payload, admin, {})
  const emptyBranch = await loadProfessionalReviewQueue(payload, scoped, {})
  assert.deepEqual(emptyNetwork.rows, [])
  assert.deepEqual(emptyBranch.rows, [])
  assert.equal(emptyBranch.totalDocs, 0)
  console.info('Professional review PostgreSQL migration and review queue smoke passed')
}
run().then(() => process.exit(0), error => {
  console.error('Professional review PostgreSQL smoke failed:', error)
  process.exit(1)
})
