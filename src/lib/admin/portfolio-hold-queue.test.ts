import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHoldQueueFilters, loadPortfolioHoldQueue } from './portfolio-hold-queue.ts'

const admin = { id: 2, role: 'admin' as const }
type Repo = Parameters<typeof loadPortfolioHoldQueue>[0]
const validRow = {
  hold_id: 14, revision_id: 19, media_id: 22, location_id: 3, barber_id: 9,
  stage: 'investigating', assigned_admin_id: 2,
  created_at: '2026-11-01T10:00:00Z', last_activity_at: '2026-11-08T10:00:00Z',
  needs_followup: true,
}
function mock(rows: Record<string, unknown>[], total = 1): Repo {
  let number = 0
  return { db: { drizzle: { execute: async () => {
    number++
    return { rows: number === 1 ? [{ total }] : rows }
  } } } } as unknown as Repo
}

test('filters are strict, optional numeric selectors allow empty GET values', () => {
  assert.deepEqual(parseHoldQueueFilters({}), {
    stage: 'open', page: 1, locationId: null, assigneeId: null,
  })
  assert.deepEqual(parseHoldQueueFilters({ stage: 'escalated',
    location: '3', assignee: '', page: '2' }), {
    stage: 'escalated', page: 2, locationId: 3, assigneeId: null,
  })
  for (const filters of [
    { stage: 'published' }, { page: '0' }, { page: '1000' },
    { location: '-3' }, { location: '03' }, { assignee: '1.5' }, { assignee: '9007199254740993' },
  ]) assert.throws(() => parseHoldQueueFilters(filters), RangeError)
})

test('reads only authorized minimal case status and calculates pagination', async () => {
  const result = await loadPortfolioHoldQueue(mock([validRow], 21), admin,
    { stage: 'investigating', location: '3', assignee: '2', page: '2' })
  assert.equal(result.total, 21)
  assert.equal(result.totalPages, 2)
  assert.equal(result.rows[0]?.holdId, 14)
  assert.equal(result.rows[0]?.needsFollowup, true)
  assert.equal(result.locationId, 3)
  assert.doesNotMatch(JSON.stringify(result), /caseReference|claimant|reason|email|private/)
})

test('rejects invalid actors or malformed SQL projections', async () => {
  await assert.rejects(loadPortfolioHoldQueue(mock([validRow]),
    { id: 0, role: 'admin' }, {}), RangeError)
  await assert.rejects(loadPortfolioHoldQueue(mock([{ ...validRow,
    stage: 'publicly_approved' }]), admin, {}), /Invalid case stage/)
  await assert.rejects(loadPortfolioHoldQueue(mock([{ ...validRow,
    assigned_admin_id: -1 }]), admin, {}), /Invalid case relation/)
  await assert.rejects(loadPortfolioHoldQueue(mock([validRow], -5), admin, {}),
    /Invalid hold queue count/)
})

test('empty page and no cases return safe metadata', async () => {
  const result = await loadPortfolioHoldQueue(mock([], 0), admin, {})
  assert.deepEqual(result.rows, [])
  assert.equal(result.totalPages, 0)
})
