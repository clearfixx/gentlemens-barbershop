import type { CollectionConfig } from 'payload'

export const Services: CollectionConfig = {
  slug: 'services',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'durationMinutes', 'price', 'isActive'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin' ? true : { isActive: { equals: true } },
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    // New optional localized copy. The legacy description is retained until
    // existing records are backfilled and verified in a separate migration.
    { name: 'localizedDescription', type: 'textarea', localized: true },
    { name: 'durationMinutes', type: 'number', required: true, min: 5, max: 480 },
    { name: 'price', type: 'number', required: true, min: 0, admin: { description: 'Price in UAH; no floating-point fractions.' } },
    { name: 'isActive', type: 'checkbox', required: true, defaultValue: false },
  ],
}
