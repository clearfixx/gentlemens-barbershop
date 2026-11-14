import type { CollectionConfig } from 'payload'
import { buildPasswordResetEmail } from '../../lib/account/password-reset-email.ts'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    forgotPassword: {
      expiration: 3600000,
      minRequestInterval: 60000,
      generateEmailSubject: () => 'Gentlemen’s Barbershop — password reset',
      generateEmailHTML: (args) => buildPasswordResetEmail(
        args?.token,
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NODE_ENV === 'production',
      ),
    },
  },
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
