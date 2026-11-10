import assert from 'node:assert/strict'
import test from 'node:test'
import type { Payload } from 'payload'
import { getBarberAvailability } from './get-barber-availability.ts'

const input = { barberId: 3, date: '2030-01-02', durationMinutes: 30 }

function fixture(overrides: {
  barberActive?: boolean
  locationActive?: boolean
  timeZone?: string
  bookings?: Array<{ startsAt: string; endsAt: string; status: string }>
  timeOff?: Array<{ startsAt: string; endsAt: string }>
  hasNextPage?: string
} = {}) {
  const reads: Array<{ collection: string; overrideAccess?: boolean; where?: unknown; limit?: number }> = []
  const payload = {
    findByID: async (args: { collection: string; overrideAccess?: boolean }) => {
      reads.push(args)
      if (args.collection === 'barbers') return {
        id: 3, isActive: overrides.barberActive ?? true, location: 2,
      }
      if (args.collection === 'locations') return {
        id: 2, isActive: overrides.locationActive ?? true,
        timeZone: overrides.timeZone ?? 'Europe/Kyiv',
      }
      throw new Error('Unexpected lookup')
    },
    find: async (args: { collection: string; overrideAccess?: boolean; where?: unknown; limit?: number }) => {
      reads.push(args)
      const docs = args.collection === 'barber-schedules'
        ? [{ weeklyShifts: [{ weekday: '3', startMinute: 540, endMinute: 720 }] }]
        : args.collection === 'bookings' ? (overrides.bookings ?? [])
        : args.collection === 'barber-time-off' ? (overrides.timeOff ?? [])
        : []
      return { docs, hasNextPage: overrides.hasNextPage === args.collection }
    },
  } as unknown as Payload
  return { payload, reads }
}

test('loads all schedule, time-off and booking records with trusted server access', async () => {
  const { payload, reads } = fixture()
  const slots = await getBarberAvailability({ payload, ...input })
  assert.deepEqual(slots.map(slot => slot.startsAt), [
    '2030-01-02T07:00:00.000Z',
    '2030-01-02T07:15:00.000Z',
    '2030-01-02T07:30:00.000Z',
    '2030-01-02T07:45:00.000Z',
    '2030-01-02T08:00:00.000Z',
    '2030-01-02T08:15:00.000Z',
    '2030-01-02T08:30:00.000Z',
    '2030-01-02T08:45:00.000Z',
    '2030-01-02T09:00:00.000Z',
    '2030-01-02T09:15:00.000Z',
    '2030-01-02T09:30:00.000Z',
  ])
  assert.deepEqual(reads.map(read => read.collection).sort(),
    ['barber-schedules', 'barber-time-off', 'barbers', 'bookings', 'locations'].sort())
  assert.ok(reads.every(read => read.overrideAccess === true))
  const bookings = reads.find(read => read.collection === 'bookings')
  assert.deepEqual((bookings?.where as { and: unknown[] }).and[3], { status: { in: ['pending', 'confirmed'] } })
})

test('pending and confirmed appointments block overlapping slots, but cancelled ones do not', async () => {
  const occupied = { startsAt: '2030-01-02T08:00:00.000Z', endsAt: '2030-01-02T08:30:00.000Z' }
  const { payload } = fixture({ bookings: [
    { ...occupied, status: 'pending' },
    { startsAt: '2030-01-02T09:00:00.000Z', endsAt: '2030-01-02T09:30:00.000Z', status: 'confirmed' },
    { startsAt: '2030-01-02T07:00:00.000Z', endsAt: '2030-01-02T07:30:00.000Z', status: 'cancelled' },
  ] })
  const slots = await getBarberAvailability({ payload, ...input })
  const starts = slots.map(slot => slot.startsAt)
  assert.ok(starts.includes('2030-01-02T07:00:00.000Z'))
  for (const blocked of ['2030-01-02T07:45:00.000Z', '2030-01-02T08:00:00.000Z',
    '2030-01-02T08:15:00.000Z', '2030-01-02T08:45:00.000Z', '2030-01-02T09:00:00.000Z']) {
    assert.ok(!starts.includes(blocked), blocked)
  }
})

test('time off blocks the entire intersecting interval', async () => {
  const { payload } = fixture({ timeOff: [
    { startsAt: '2030-01-02T07:45:00.000Z', endsAt: '2030-01-02T08:45:00.000Z' },
  ] })
  const starts = (await getBarberAvailability({ payload, ...input })).map(slot => slot.startsAt)
  assert.ok(starts.includes('2030-01-02T07:00:00.000Z'))
  assert.ok(starts.includes('2030-01-02T08:45:00.000Z'))
  assert.ok(!starts.includes('2030-01-02T08:30:00.000Z'))
})

test('inactive barber or location returns no slots without querying schedules', async () => {
  for (const overrides of [{ barberActive: false }, { locationActive: false }]) {
    const { payload, reads } = fixture(overrides)
    assert.deepEqual(await getBarberAvailability({ payload, ...input }), [])
    assert.ok(!reads.some(read => read.collection === 'barber-schedules'))
  }
})

test('fails closed on truncated schedules, time off or bookings', async () => {
  for (const collection of ['barber-schedules', 'barber-time-off', 'bookings']) {
    const { payload } = fixture({ hasNextPage: collection })
    await assert.rejects(getBarberAvailability({ payload, ...input }),
      /Availability query exceeded its safe result limit/)
  }
})

test('rejects impossible dates before any Payload I/O', async () => {
  const { payload, reads } = fixture()
  for (const date of ['2030-02-30', '2030-13-01', 'invalid']) {
    await assert.rejects(getBarberAvailability({ payload, ...input, date }), RangeError)
  }
  assert.equal(reads.length, 0)
})
