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
    { name: 'description', type: 'textarea' },
    { name: 'isActive', type: 'checkbox', defaultValue: false, required: true },
  ],
}
