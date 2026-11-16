import assert from 'node:assert/strict'
import test from 'node:test'
import { CommercialChangeRequests } from '../../payload/collections/CommercialChangeRequests.ts'
import { LocationAssignments } from '../../payload/collections/LocationAssignments.ts'

type AccessRequest = { user: { id: number; role: string } | null; payload?: unknown }
async function allowed(
  config: { access?: Record<string, unknown> },
  action: string,
  req: AccessRequest,
): Promise<unknown> {
  const rule = config.access?.[action]
  assert.equal(typeof rule, 'function')
  return await (rule as (args: { req: unknown }) => unknown)({ req })
}

test('the approval queue refuses all direct CMS writes, even from network admins', async () => {
  for (const role of ['admin', 'location_admin', 'barber', 'customer']) {
    for (const operation of ['create', 'update', 'delete']) {
      assert.equal(await allowed(CommercialChangeRequests, operation, {
        user: { id: 8, role },
      }), false)
    }
  }
})

test('assignment grants and revocations remain exclusive to network admins', async () => {
  for (const operation of ['read', 'create', 'update', 'delete']) {
    assert.equal(await allowed(LocationAssignments, operation, {
      user: { id: 8, role: 'admin' },
    }), true)
    assert.equal(await allowed(LocationAssignments, operation, {
      user: { id: 8, role: 'location_admin' },
    }), false)
  }
})

test('approval history excludes customers and barbers', async () => {
  for (const role of ['barber', 'customer']) {
    assert.equal(await allowed(CommercialChangeRequests, 'read', {
      user: { id: 8, role },
    }), false)
  }
  assert.equal(await allowed(CommercialChangeRequests, 'read', {
    user: { id: 8, role: 'admin' },
  }), true)
})

test('revoked manager membership gives no approval history', async () => {
  const payload = {
    find: async () => ({ docs: [], hasNextPage: false }),
  }
  const result = await allowed(CommercialChangeRequests, 'read', {
    user: { id: 8, role: 'location_admin' }, payload,
  })
  assert.equal(result, false)
})
