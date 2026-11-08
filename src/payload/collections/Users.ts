import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  fields: [
    { name: 'displayName', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'customer',
      options: ['customer', 'barber', 'admin'],
      access: {
        create: ({ req }) => Boolean(req.user?.role === 'admin'),
        update: ({ req }) => Boolean(req.user?.role === 'admin'),
      },
    },
  ],
}
