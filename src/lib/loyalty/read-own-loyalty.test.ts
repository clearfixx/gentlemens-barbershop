import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getOwnLoyalty, LoyaltyAccessError, type LoyaltyReadRepository } from './read-own-loyalty.ts'

test('customer identity comes only from authenticated principal', async () => {
  const requested: string[] = []
  const repository: LoyaltyReadRepository = {
    async findCustomerSnapshot(customerId) {
      requested.push(customerId)
      return { customerId, xp: 100, bonus: 20, history: [] }
    },
  }
  assert.deepEqual(await getOwnLoyalty({ id: 42, role: 'customer' }, repository),
    { customerId: '42', xp: 100, bonus: 20, history: [] })
  assert.deepEqual(requested, ['42'])
})

test('guests, barbers and admins cannot use the customer-only read model', async () => {
  let queries = 0
  const repository: LoyaltyReadRepository = {
    async findCustomerSnapshot() { queries++; return null },
  }
  for (const principal of [null, { id: 1, role: 'barber' }, { id: 1, role: 'admin' }, { id: '', role: 'customer' }]) {
    await assert.rejects(() => getOwnLoyalty(principal, repository), LoyaltyAccessError)
  }
  assert.equal(queries, 0)
})

test('new customer has an empty snapshot and no shared account', async () => {
  const repository: LoyaltyReadRepository = { async findCustomerSnapshot() { return null } }
  assert.deepEqual(await getOwnLoyalty({ id: 'new', role: 'customer' }, repository),
    { customerId: 'new', xp: 0, bonus: 0, history: [] })
})

test('rejects cross-customer repository responses and corrupt balances', async () => {
  const wrong: LoyaltyReadRepository = {
    async findCustomerSnapshot() { return { customerId: 'other', xp: 1, bonus: 2, history: [] } },
  }
  await assert.rejects(() => getOwnLoyalty({ id: 1, role: 'customer' }, wrong), /another customer/)
  const invalid: LoyaltyReadRepository = {
    async findCustomerSnapshot() { return { customerId: '1', xp: -1, bonus: 0, history: [] } },
  }
  await assert.rejects(() => getOwnLoyalty({ id: 1, role: 'customer' }, invalid), /Invalid loyalty/)
})
