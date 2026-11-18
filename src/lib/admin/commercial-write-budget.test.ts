import assert from 'node:assert/strict'
import test from 'node:test'
import { checkCommercialWriteBudget } from './commercial-write-budget.ts'

type PayloadArg = Parameters<typeof checkCommercialWriteBudget>[0]
function fake(rows: unknown[]): PayloadArg {
  return { db: { drizzle: { execute: async () => ({ rows }) } } } as unknown as PayloadArg
}

test('staff rate budget requires a trusted valid account before database I/O', async () => {
  const broken = { db: { drizzle: { execute: () => { throw new Error('Unexpected SQL') } } } } as unknown as PayloadArg
  for (const id of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(checkCommercialWriteBudget(broken, id), /Invalid staff rate limiter input/)
  }
  await assert.rejects(checkCommercialWriteBudget(broken, 1, -1), /Invalid staff rate limiter input/)
})

test('staff budget only succeeds when both global and actor counters allow it', async () => {
  assert.deepEqual(await checkCommercialWriteBudget(fake([
    { global_allowed: true, actor_allowed: true },
  ]), 7, 120_000), { allowed: true, retryAfterSeconds: 60 })
  assert.deepEqual(await checkCommercialWriteBudget(fake([
    { global_allowed: true, actor_allowed: false },
  ]), 7, 150_000), { allowed: false, retryAfterSeconds: 30 })
  assert.deepEqual(await checkCommercialWriteBudget(fake([
    { global_allowed: false, actor_allowed: true },
  ]), 7, 150_000), { allowed: false, retryAfterSeconds: 30 })
})

test('invalid or missing SQL result fails closed', async () => {
  for (const rows of [[], [{ global_allowed: 1, actor_allowed: true }],
    [{ global_allowed: true }], [{ global_allowed: true, actor_allowed: true }, {}]]) {
    await assert.rejects(checkCommercialWriteBudget(fake(rows), 7), /Invalid staff rate limiter response/)
  }
  await assert.rejects(checkCommercialWriteBudget({
    db: { drizzle: { execute: async () => { throw new Error('Database offline') } } },
  } as unknown as PayloadArg, 7), /Database offline/)
})
