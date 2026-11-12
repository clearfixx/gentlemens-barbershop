import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const payload = await getPayload({ config })
console.info('[rehearsal] current Payload initialized against existing baseline database')
for (const collection of ['services', 'locations', 'barbers', 'bookings'] as const) {
  const result = await payload.find({
    collection,
    where: { id: { equals: 900001 } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  if (result.docs.length !== 1) throw new Error(`Missing legacy fixture in ${collection}`)
  console.info(`[rehearsal] preserved ${collection} fixture`)
}
process.exit(0)
