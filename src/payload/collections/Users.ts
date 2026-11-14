import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    forgotPassword: {
      expiration: 3600000,
      minRequestInterval: 60000,
      generateEmailSubject: () => 'Gentlemen’s Barbershop — password reset',
      generateEmailHTML: ({ token }) => {
        const configured = process.env.NEXT_PUBLIC_SITE_URL
        if (!configured) throw new Error('Password reset site URL is not configured')
        const origin = new URL(configured)
        if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
          throw new Error('Password reset requires HTTPS')
        }
        const reset = new URL('/uk/auth/reset-password', origin)
        reset.searchParams.set('token', token)
        const href = reset.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        return '<p>Reset your Gentlemen’s Barbershop password:</p><p><a href="' + href + '">Reset password</a></p><p>Expires in 60 minutes.</p>'
      },
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
