import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLoyaltySqlReadRepository, type LoyaltySqlClient } from './sql-read-repository.ts'
import { getOwnLoyalty } from './read-own-loyalty.ts'

test('uses one parameterized statement scoped to authenticated customer', async () => {
  const calls: { sql: string; params: readonly unknown[] }[] = []
  const client: LoyaltySqlClient = {
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows: [{
        customer_id: '42', xp: '120', bonus: '15',
        history: [{
          id: '1', kind: 'earn', xpDelta: '120', bonusDelta: '25',
          source: 'booking', createdAt: '2026-11-10T08:00:00.000Z',
        }, {
          id: '2', kind: 'redeem', xpDelta: '0', bonusDelta: '-10',
          source: 'order', createdAt: '2026-11-10T09:00:00.000Z',
        }],
      }] }
    },
  }
  const result = await getOwnLoyalty({ id: 42, role: 'customer' },
    createLoyaltySqlReadRepository(client))
  assert.equal(result.xp, 120)
  assert.equal(result.bonus, 15)
  assert.equal(result.history[1]?.bonusDelta, -10)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.params, ['42'])
  assert.match(calls[0]?.sql ?? '', /WHERE a.customer_id = \$1::bigint/)
  assert.match(calls[0]?.sql ?? '', /WHERE e.customer_id = a.customer_id/)
})

test('missing account yields empty read model', async () => {
  const repository = createLoyaltySqlReadRepository({
    async query() { return { rows: [] } },
  })
  assert.deepEqual(await getOwnLoyalty({ id: 8, role: 'customer' }, repository),
    { customerId: '8', xp: 0, bonus: 0, history: [] })
})

test('rejects unsafe IDs, mismatched rows, invalid balances and history', async () => {
  let queries = 0
  const repository = createLoyaltySqlReadRepository({
    async query() { queries++; return { rows: [{ customer_id: 'other', xp: '0', bonus: '0', history: [] }] } },
  })
  await assert.rejects(() => repository.findCustomerSnapshot('1 OR TRUE'), /Invalid authenticated/)
  assert.equal(queries, 0)
  await assert.rejects(() => repository.findCustomerSnapshot('42'), /mismatch/)

  const bad = (row: unknown) => createLoyaltySqlReadRepository({
    async query() { return { rows: [row] } },
  }).findCustomerSnapshot('42')
  await assert.rejects(() => bad({ customer_id: '42', xp: '9007199254740992', bonus: '0', history: [] }), /Invalid loyalty xp/)
  await assert.rejects(() => bad({ customer_id: '42', xp: '0', bonus: '0', history: [{}] }), /Invalid loyalty history entry/)
})
