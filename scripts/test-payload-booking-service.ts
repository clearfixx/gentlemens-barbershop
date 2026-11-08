import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { createPayloadBooking } from '../src/lib/booking/payload-booking-service.ts'
import { BookingSlotConflictError } from '../src/lib/booking/booking-errors.ts'

async function main() {
  const locationId = Number(process.env.CI_LOCATION_ID)
  const barberId = Number(process.env.CI_BARBER_ID)
  const serviceId = Number(process.env.CI_SERVICE_ID)
  assert.ok([locationId, barberId, serviceId].every(id => Number.isSafeInteger(id) && id > 0))
  const payload = await getPayload({ config })
  // The fixture location has no timezone override; configure a real IANA zone.
  await payload.update({
    collection: 'locations', id: locationId, overrideAccess: true,
    data: { timeZone: 'Europe/Kyiv' },
  })
  const localDate = '2037-01-02'
  const weekday = String(new Date(localDate + 'T00:00:00.000Z').getUTCDay())
  await payload.create({
    collection: 'barber-schedules', overrideAccess: true,
    data: {
      label: 'CI booking service shift', barber: barberId, isActive: true,
      weeklyShifts: [{ weekday, startMinute: 540, endMinute: 1080 }],
    },
  })
  const request = {
    locationId, barberId, serviceIds: [serviceId],
    startsAt: '2037-01-02T09:00:00.000Z',
    customerName: 'CI trusted booking', customerPhone: '+380671234567',
  }
  const created = await createPayloadBooking(payload, request)
  assert.equal(created.totalPrice, 650)
  assert.equal(created.startsAt, request.startsAt)
  assert.equal(created.endsAt, '2037-01-02T10:00:00.000Z')
  assert.equal(created.status, 'pending')
  await assert.rejects(createPayloadBooking(payload, request), BookingSlotConflictError)
  const saved = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    where: { and: [
      { barber: { equals: barberId } },
      { startsAt: { equals: request.startsAt } },
    ] },
  })
  assert.equal(saved.totalDocs, 1)
  assert.equal(saved.docs[0]?.id, created.id)
  console.info('Trusted booking service: catalog, schedule, persistence and duplicate-slot rejection verified')
}

main().then(
  () => process.exit(0),
  error => { console.error(error); process.exit(1) },
)
