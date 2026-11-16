import assert from 'node:assert/strict'
import test from 'node:test'
import { Bookings } from '../../payload/collections/Bookings.ts'

type AccessRule = (args: { req: { user: { id: number; role: string } | null } }) => boolean | Promise<boolean>

test('direct Payload booking writes are forbidden for all roles, including network admin', async () => {
  const access = Bookings.access as unknown as Record<string, AccessRule>
  for (const role of ['admin', 'location_admin', 'barber', 'customer']) {
    for (const action of ['create', 'update', 'delete']) {
      assert.equal(await access[action]({ req: { user: { id: 7, role } } }), false,
        `${role} must not bypass the guarded booking service via ${action}`)
    }
  }
  for (const action of ['create', 'update', 'delete']) {
    assert.equal(await access[action]({ req: { user: null } }), false)
  }
})

test('network admins retain read-only collection inventory, other roles do not gain global reads', async () => {
  const access = Bookings.access as Record<string, AccessRule>
  assert.equal(await access.read({ req: { user: { id: 7, role: 'admin' } } }), true)
  for (const role of ['location_admin', 'barber', 'customer']) {
    assert.equal(await access.read({ req: { user: { id: 7, role } } }), false)
  }
  assert.equal(await access.read({ req: { user: null } }), false)
})
