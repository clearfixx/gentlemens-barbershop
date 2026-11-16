import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { submitBarberTariffProposal } from '../src/lib/admin/prepare-barber-tariff-proposal.ts'
import { decideBarberTariffProposal } from '../src/lib/admin/decide-barber-tariff-proposal.ts'

/**
 * Disposable PostgreSQL integration test. Run only against a dedicated
 * versioned test database with all committed migrations applied.
 * Exercises real Payload array storage, FK constraints and Drizzle row locks.
 */
async function run() {
  if (process.env.ADMIN_APPROVAL_INTEGRATION !== 'isolated') {
    throw new Error('Refusing integration fixture writes outside an isolated test database')
  }
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 12)
  const created: Array<{ collection: 'users' | 'locations' | 'services' | 'barbers' | 'location-assignments' | 'commercial-change-requests'; id: number }> = []
  const remember = <T extends { id: number | string }>(collection: typeof created[number]['collection'], value: T): T => {
    created.push({ collection, id: Number(value.id) })
    return value
  }
  try {
    const [manager, admin, location, service] = await Promise.all([
      payload.create({ collection: 'users', overrideAccess: true,
        data: { email: `manager-${suffix}@example.invalid`, password: 'integration-only-Strong123!', role: 'location_admin' } }),
      payload.create({ collection: 'users', overrideAccess: true,
        data: { email: `admin-${suffix}@example.invalid`, password: 'integration-only-Strong123!', role: 'admin' } }),
      payload.create({ collection: 'locations', overrideAccess: true,
        data: { name: 'Approval test branch', city: 'Test', address: 'Test street 1',
          slug: `approval-test-location-${suffix}`, isActive: true, timeZone: 'Europe/Kyiv',
          cancellationDeadlineMinutes: 60 } }),
      payload.create({ collection: 'services', overrideAccess: true,
        data: { name: 'Approval test haircut', slug: `approval-test-service-${suffix}`,
          isActive: true, price: 500, durationMinutes: 45 } }),
    ])
    remember('users', manager)
    remember('users', admin)
    remember('locations', location)
    remember('services', service)
    const barber = remember('barbers', await payload.create({
      collection: 'barbers', overrideAccess: true,
      data: { name: 'Approval test barber', slug: `approval-test-barber-${suffix}`,
        location: Number(location.id), isActive: true,
        serviceOfferings: [{ service: Number(service.id), priceOverride: 600 }] },
    }))
    remember('location-assignments', await payload.create({
      collection: 'location-assignments', overrideAccess: true,
      data: { user: Number(manager.id), location: Number(location.id), isActive: true },
    }))
    const input = (proposedValue: number) => ({
      locationId: Number(location.id), barberId: Number(barber.id),
      serviceId: Number(service.id), kind: 'barber_price' as const, proposedValue,
    })
    const submit = async (amount: number) => remember('commercial-change-requests',
      await submitBarberTariffProposal(payload,
        { id: Number(manager.id), role: 'location_admin' }, input(amount)))

    const first = await submit(750)
    assert.equal(first.status, 'pending')
    assert.equal(first.oldValue, 600)
    const before = await payload.findByID({ collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true })
    assert.equal(before.serviceOfferings?.[0]?.priceOverride, 600, 'Submission must not modify live tariff')

    const approved = await decideBarberTariffProposal(payload, Number(first.id),
      { id: Number(admin.id), role: 'admin' }, { status: 'approved' })
    assert.equal(approved.status, 'approved')
    const after = await payload.findByID({ collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true })
    assert.equal(after.serviceOfferings?.[0]?.priceOverride, 750, 'Approval must update the live tariff')
    const approvedRecord = await payload.findByID({ collection: 'commercial-change-requests', id: first.id,
      depth: 0, overrideAccess: true })
    assert.equal(approvedRecord.status, 'approved')
    assert.equal(typeof approvedRecord.decidedAt, 'string')

    await assert.rejects(
      decideBarberTariffProposal(payload, Number(first.id),
        { id: Number(admin.id), role: 'admin' }, { status: 'approved' }),
      /no longer pending/,
      'Approval must not be replayed',
    )

    const stale = await submit(820)
    const staleBefore = await payload.findByID({ collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true })
    await payload.update({
      collection: 'barbers', id: barber.id, overrideAccess: true,
      data: { serviceOfferings: [{ service: Number(service.id), priceOverride: 780 }] },
    })
    assert.equal(staleBefore.serviceOfferings?.[0]?.priceOverride, 750)
    await assert.rejects(
      decideBarberTariffProposal(payload, Number(stale.id),
        { id: Number(admin.id), role: 'admin' }, { status: 'approved' }),
      /stale/,
    )
    const staleRecord = await payload.findByID({
      collection: 'commercial-change-requests', id: stale.id, depth: 0, overrideAccess: true,
    })
    assert.equal(staleRecord.status, 'pending', 'Stale decision must roll back')

    const rejected = await decideBarberTariffProposal(payload, Number(stale.id),
      { id: Number(admin.id), role: 'admin' },
      { status: 'rejected', reason: 'Tariff changed during review' })
    assert.equal(rejected.status, 'rejected')
    const afterReject = await payload.findByID({ collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true })
    assert.equal(afterReject.serviceOfferings?.[0]?.priceOverride, 780, 'Rejection must not alter tariff')

    const simultaneous = await Promise.all([submit(850), submit(900)])
    const outcomes = await Promise.allSettled(simultaneous.map(proposal =>
      decideBarberTariffProposal(payload, Number(proposal.id),
        { id: Number(admin.id), role: 'admin' }, { status: 'approved' })))
    assert.equal(outcomes.filter(entry => entry.status === 'fulfilled').length, 1,
      'Only one competing tariff change may be applied')
    assert.equal(outcomes.filter(entry => entry.status === 'rejected').length, 1,
      'A competing stale approval must be rejected')
    const winner = outcomes.find(entry => entry.status === 'fulfilled')
    assert.ok(winner && winner.status === 'fulfilled')
    const finalBarber = await payload.findByID({ collection: 'barbers', id: barber.id, depth: 0, overrideAccess: true })
    assert.ok([850, 900].includes(finalBarber.serviceOfferings?.[0]?.priceOverride ?? -1))
    console.info('Admin tariff PostgreSQL approval integration passed: approve, reject, stale, replay, concurrent')
  } finally {
    // Reverse dependency order. Fail the test if cleanup fails.
    for (const item of created.reverse()) {
      await payload.delete({ collection: item.collection, id: item.id, overrideAccess: true })
    }
  }
}

run().then(() => process.exit(0), error => {
  console.error('Admin tariff PostgreSQL integration failed:', error)
  process.exit(1)
})
