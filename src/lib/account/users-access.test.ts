import assert from 'node:assert/strict'
import test from 'node:test'
import { Users } from '../../payload/collections/Users.ts'

test('customer account is self-scoped for reads and updates', () => {
  for (const operation of ['read', 'update'] as const) {
    const access = Users.access?.[operation]
    assert.equal(typeof access, 'function')
    if (typeof access !== 'function') throw new Error('Expected a collection access function')
    assert.deepEqual(access({ req: { user: { id: 19, role: 'customer' } } } as never), { id: { equals: 19 } })
    assert.equal(access({ req: { user: null } } as never), false)
  }
})
test('public customers cannot set their own privileged role', () => {
  const role = Users.fields.find(field => 'name' in field && field.name === 'role')
  assert.ok(role && 'access' in role)
  const privileges = role.access
  assert.equal(privileges?.create?.({ req: { user: null } } as never), false)
  assert.equal(privileges?.update?.({ req: { user: { id: 19, role: 'customer' } } } as never), false)
  assert.equal(privileges?.update?.({ req: { user: { id: 1, role: 'admin' } } } as never), true)
})
