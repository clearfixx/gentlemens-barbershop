import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

  if (!email || !password || !email.includes('@') || password.length < 16) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 16 characters).')
  }

  console.info('[bootstrap] initializing Payload')
  const payload = await getPayload({ config })
  console.info('[bootstrap] Payload initialized')

  // Only bootstrap a fresh installation. Never promote existing public accounts.
  console.info('[bootstrap] checking existing users')
  const existing = await payload.count({ collection: 'users', overrideAccess: true })
  if (existing.totalDocs !== 0) {
    throw new Error('Bootstrap refused: users already exist. Provision administrators manually using a trusted process.')
  }

  console.info('[bootstrap] creating initial administrator')
  await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: { email, password, role: 'admin' },
  })
  payload.logger.info('Initial administrator created. Remove bootstrap credentials from the environment.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
