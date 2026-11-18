import assert from 'node:assert/strict'
import test from 'node:test'
import { assertValidLocationAssignment } from './validate-location-assignment.ts'

type Lookup = Parameters<typeof assertValidLocationAssignment>[0]
function repo(role: string, returnedLocationId = 4): Lookup {
  return {
    findByID: async ({ collection, id }: { collection: string; id: number }) =>
      collection === 'users'
        ? { id, role }
        : { id: returnedLocationId },
  } as unknown as Lookup
}

test('location administrator can be assigned to an existing branch', async () => {
  await assert.doesNotReject(assertValidLocationAssignment(repo('location_admin'), 11, 4))
  await assert.doesNotReject(assertValidLocationAssignment(repo('location_admin'), { id: 11 }, { id: 4 }))
})

test('network administrators, barbers and customers cannot receive manager assignments', async () => {
  for (const role of ['admin', 'barber', 'customer']) {
    await assert.rejects(assertValidLocationAssignment(repo(role), 11, 4), /location administrator/)
  }
})

test('rejects absent or mismatched location references and invalid IDs', async () => {
  await assert.rejects(assertValidLocationAssignment(repo('location_admin', 8), 11, 4), /valid branch/)
  for (const id of [0, -1, 1.5, '11', null]) {
    await assert.rejects(assertValidLocationAssignment(repo('location_admin'), id, 4), /Invalid location assignment/)
  }
})
