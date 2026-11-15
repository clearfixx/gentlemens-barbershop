import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Users } from './payload/collections/Users.ts'
import { accountEmailAdapter } from './lib/account/account-email.ts'
import { Media } from './payload/collections/Media.ts'
import { Locations } from './payload/collections/Locations.ts'
import { Services } from './payload/collections/Services.ts'
import { Barbers } from './payload/collections/Barbers.ts'
import { Bookings } from './payload/collections/Bookings.ts'
import { BookingEvents } from './payload/collections/BookingEvents.ts'
import { BarberSchedules } from './payload/collections/BarberSchedules.ts'
import { BarberTimeOff } from './payload/collections/BarberTimeOff.ts'
import { Translations } from './payload/collections/Translations.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    // Customer and barber accounts never enter the CMS administration UI.
    // First administrator must be provisioned by a trusted server-side bootstrap.
  },
  collections: [Users, Media, Locations, Services, Barbers, Bookings, BookingEvents, BarberSchedules, BarberTimeOff, Translations],
  editor: lexicalEditor(),
  localization: {
    locales: [
      { label: 'Українська', code: 'uk' },
      { label: 'English', code: 'en' },
    ],
    defaultLocale: 'uk',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  email: accountEmailAdapter,
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    // Never let a production process auto-alter the database schema.
    // Apply reviewed, versioned Payload migrations before deploying the app.
    push: process.env.NODE_ENV !== 'production',
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
