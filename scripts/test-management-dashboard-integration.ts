import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { loadManagementDashboard } from '../src/lib/admin/management-dashboard.ts'

async function main() {
  if (process.env.ADMIN_APPROVAL_INTEGRATION !== 'isolated') {
    throw new Error('Dashboard integration requires the isolated test database')
  }
  const payload = await getPayload({ config })
  // Exercise the live schema and SQL for global and scoped metrics. No writes.
  const all = await loadManagementDashboard(payload, null)
  const unavailableBranch = await loadManagementDashboard(payload, [2147483600])
  for (const data of [all, unavailableBranch]) {
    assert.equal(typeof data.metrics.bookingsToday, 'number')
    assert.equal(typeof data.metrics.awaitingConfirmation, 'number')
    assert.equal(typeof data.metrics.revenueTodayUAH, 'number')
    assert.equal(typeof data.metrics.pendingReviews, 'number')
    assert.equal(typeof data.metrics.pendingApprovals, 'number')
    assert.ok(data.recentBookings.length <= 8)
  }
  assert.equal(unavailableBranch.metrics.bookingsToday, 0)
  assert.equal(unavailableBranch.metrics.awaitingConfirmation, 0)
  assert.equal(unavailableBranch.metrics.pendingApprovals, 0)
  assert.equal(unavailableBranch.metrics.pendingReviews, 0)
  assert.deepEqual(unavailableBranch.recentBookings, [])
  console.info('Management dashboard real PostgreSQL query integration passed')
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
