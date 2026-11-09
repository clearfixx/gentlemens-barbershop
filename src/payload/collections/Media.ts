import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] },
  fields: [{ name: 'alt', type: 'text', required: true }],
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
}
