import type { CollectionConfig } from 'payload'

export const Barbers: CollectionConfig = {
  slug: 'barbers',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'location', 'isActive'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin' ? true : { isActive: { equals: true } },
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'bio', type: 'textarea' },
    { name: 'portrait', type: 'upload', relationTo: 'media' },
    { name: 'location', type: 'relationship', relationTo: 'locations', required: true },
    {
      name: 'serviceOfferings',
      type: 'array',
      fields: [
        { name: 'service', type: 'relationship', relationTo: 'services', required: true },
        { name: 'priceOverride', type: 'number', min: 0, admin: { description: 'Optional price in UAH; leave blank to use the base service price.' } },
        { name: 'durationOverrideMinutes', type: 'number', min: 5, max: 480, admin: { description: 'Optional duration; leave blank to use the base service duration.' } },
      ],
    },
    { name: 'isActive', type: 'checkbox', required: true, defaultValue: false },
  ],
}
