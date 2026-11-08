import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  access: {
    // Public registration creates customers only; role changes are admin-only.
    create: () => true,
    admin: ({ req }) => req.user?.role === 'admin',
    read: ({ req }) =>
      req.user?.role === 'admin'
        ? true
        : req.user
          ? { id: { equals: req.user.id } }
          : false,
    update: ({ req }) =>
      req.user?.role === 'admin'
        ? true
        : req.user
          ? { id: { equals: req.user.id } }
          : false,
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'displayName', type: 'text' },
    {
      name: 'role', type: 'select', required: true, defaultValue: 'customer',
      options: ['customer', 'barber', 'admin'],
      access: {
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
}
