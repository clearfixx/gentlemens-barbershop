import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getOwnLoyaltyHistoryPage } from './history-page.ts'
import type { LoyaltySqlClient } from './sql-read-repository.ts'

const entry = (id: number) => ({
  id: String(id), kind: 'earn', xp_delta: '5', bonus_delta: '1',
  source: 'booking', created_at: '2026-11-10T08:00:00.000Z',
})

test('keyset pagination returns bounded results and next cursor', async () => {
  const calls: { sql: string; args: readonly unknown[] }[] = []
  const client: LoyaltySqlClient = {
    async query(sql, args) {
      calls.push({ sql, args })
      return { rows: [entry(5), entry(4), entry(3)] }
    },
  }
  const result = await getOwnLoyaltyHistoryPage({ id: 7, role: 'customer' }, client,
    { limit: 2, before: '6' })
  assert.deepEqual(result.entries.map(x => x.id), ['5', '4'])
  assert.equal(result.nextCursor, '4')
  assert.deepEqual(calls[0]?.args, ['7', '6', 3])
  assert.match(calls[0]?.sql ?? '', /WHERE customer_id = \$1::bigint/)
  assert.match(calls[0]?.sql ?? '', /ORDER BY id DESC/)
})

test('no next cursor on last page', async () => {
  const client: LoyaltySqlClient = { async query() { return { rows: [entry(1)] } } }
  const result = await getOwnLoyaltyHistoryPage({ id: '7', role: 'customer' }, client)
  assert.equal(result.nextCursor, null)
  assert.equal(result.entries.length, 1)
})

test('rejects invalid identity, cursor, limit before database access', async () => {
  let calls = 0
  const client: LoyaltySqlClient = { async query() { calls++; return { rows: [] } } }
  await assert.rejects(() => getOwnLoyaltyHistoryPage(null, client), /authentication/)
  await assert.rejects(() => getOwnLoyaltyHistoryPage({ id: 7, role: 'admin' }, client), /authentication/)
  await assert.rejects(() => getOwnLoyaltyHistoryPage({ id: 7, role: 'customer' }, client,
    { before: '1 OR TRUE' }), /cursor/)
  await assert.rejects(() => getOwnLoyaltyHistoryPage({ id: 7, role: 'customer' }, client,
    { limit: 51 }), /page size/)
  for (const id of ['new', '01', '9007199254740992', 0]) {
    await assert.rejects(() => getOwnLoyaltyHistoryPage({ id, role: 'customer' }, client), /authentication/)
  }
  assert.equal(calls, 0)
})

test('rejects corrupt rows and excess query results', async () => {
  const invalid: LoyaltySqlClient = { async query() { return { rows: [{ ...entry(1), xp_delta: 'Infinity' }] } } }
  await assert.rejects(() => getOwnLoyaltyHistoryPage({ id: 7, role: 'customer' }, invalid), /delta/)
  const excess: LoyaltySqlClient = { async query() { return { rows: [entry(4), entry(3), entry(2)] } } }
  await assert.rejects(() => getOwnLoyaltyHistoryPage({ id: 7, role: 'customer' }, excess,
    { limit: 1 }), /page length/)
})
