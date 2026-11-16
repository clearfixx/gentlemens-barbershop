import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDashboardLocations, loadManagementDashboard } from './management-dashboard.ts'

const network = { userId: 1, role: 'admin' as const, locationIds: [] }
const manager = { userId: 2, role: 'location_admin' as const, locationIds: [5, 9] }

test('all-branch network reads and manager-only assigned locations', () => {
  assert.equal(resolveDashboardLocations(network, undefined), null)
  assert.deepEqual(resolveDashboardLocations(manager, undefined), [5, 9])
  assert.deepEqual(resolveDashboardLocations(network, '16'), [16])
  assert.deepEqual(resolveDashboardLocations(manager, '9'), [9])
  assert.throws(() => resolveDashboardLocations(manager, '16'), /forbidden/)
})

test('malformed location selection fails closed', () => {
  for (const input of ['', '0', '-1', '2.5', '01', 'abc', '9007199254740993']) {
    assert.throws(() => resolveDashboardLocations(manager, input))
  }
})

type Repository = Parameters<typeof loadManagementDashboard>[0]
test('scoped dashboard uses bounded recent bookings and trusted database aggregates', async () => {
  const statements: unknown[] = []
  const payload = {
    db: { drizzle: { execute: async (query: unknown) => {
      statements.push(query)
      if (statements.length === 1) return {
        rows: [{ today: '3', pending: 2, completed: 1, revenue: '550' }],
      }
      return { rows: [{ total: 4 }] }
    } } },
    find: async (options: { where?: unknown; limit: number }) => {
      assert.equal(options.limit, 8)
      assert.deepEqual(options.where, { location: { in: [5] } })
      return { docs: [{
        id: 25, location: 5, customerName: 'Test', startsAt: '2026-11-16T10:00:00.000Z',
        status: 'confirmed', totalPrice: 550,
      }] }
    },
  } as unknown as Repository
  const data = await loadManagementDashboard(payload, [5])
  assert.deepEqual(data.metrics, {
    bookingsToday: 3, awaitingConfirmation: 2, completedToday: 1,
    revenueTodayUAH: 550, pendingApprovals: 4, pendingReviews: 4,
  })
  assert.equal(data.recentBookings[0].locationId, 5)
  assert.equal(statements.length, 3)
})

test('empty or invalid manager scope never reaches the DB', async () => {
  const payload = {
    db: { drizzle: { execute: () => { throw new Error('unexpected DB call') } } },
  } as unknown as Repository
  await assert.rejects(loadManagementDashboard(payload, []), /assigned locations/)
  await assert.rejects(loadManagementDashboard(payload, [0]), /assigned locations/)
})
