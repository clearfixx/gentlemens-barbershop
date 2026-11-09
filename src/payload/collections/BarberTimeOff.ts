import type { CollectionConfig } from 'payload'

// Exceptions are administrative until the booking availability service is ready.
// A full-day closure has no times; partial closures use explicit UTC timestamps.
export const BarberTimeOff: CollectionConfig = {
  slug: 'barber-time-off',
  admin: { useAsTitle: 'reason', defaultColumns: ['barber', 'startsAt', 'endsAt', 'reason'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data?.startsAt || !data?.endsAt) return data
        const start = Date.parse(String(data.startsAt))
        const end = Date.parse(String(data.endsAt))
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
          throw new Error('Time off must end after it starts.')
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'barber', type: 'relationship', relationTo: 'barbers', required: true, index: true },
    { name: 'reason', type: 'text', required: true },
    { name: 'startsAt', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'endsAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
