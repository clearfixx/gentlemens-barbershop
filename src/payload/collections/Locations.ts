import { isValidCancellationDeadlineMinutes } from '../../lib/booking/cancellation-policy.ts'
import type { CollectionConfig } from 'payload'

export const Locations: CollectionConfig = {
  slug: 'locations',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'city', 'isActive'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin' ? true : { isActive: { equals: true } },
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'city', type: 'text', required: true },
    { name: 'address', type: 'text', required: true },
    { name: 'phone', type: 'text' },
    {
      name: 'cancellationDeadlineMinutes', type: 'number', required: true,
      defaultValue: 60, min: 0, max: 10080,
      admin: { description: 'Minimum whole minutes before appointment start for customer self-cancellation. Zero permits cancellation until the start.' },
      validate: (value: unknown) => isValidCancellationDeadlineMinutes(value)
        ? true
        : 'Enter a whole number of minutes between 0 and 10080.',
    },
    {
      name: 'timeZone', type: 'text', required: true, defaultValue: 'Europe/Kyiv',
      admin: { description: 'IANA timezone identifier, e.g. Europe/Kyiv.' },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || !value.trim()) return 'Enter an IANA timezone.'
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: value })
          return true
        } catch {
          return 'Enter a valid IANA timezone, e.g. Europe/Kyiv.'
        }
      },
    },
    { name: 'description', type: 'textarea' },
    // Optional locale-specific copy; legacy content remains untouched.
    { name: 'localizedDescription', type: 'textarea', localized: true },
    { name: 'isActive', type: 'checkbox', defaultValue: false, required: true },
  ],
}
