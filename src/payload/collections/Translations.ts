import type { CollectionConfig } from 'payload'
import { validateTranslationOverrides } from '../../i18n/override-validation.ts'

/**
 * Admin-only draft/publish storage. Public pages continue to use versioned
 * dictionaries until the published-only resolver and cache invalidation ship.
 */
export const Translations: CollectionConfig = {
  slug: 'translations',
  admin: {
    useAsTitle: 'locale',
    defaultColumns: ['locale', 'status', 'updatedAt'],
    description: 'UI dictionary overrides. Drafts are not shown on the public site.',
  },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'locale', type: 'select', required: true, unique: true,
      options: [
        { label: 'Українська', value: 'uk' },
        { label: 'English', value: 'en' },
      ],
      admin: { description: 'One dictionary override document per locale.' },
    },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'entries', type: 'json', required: true, defaultValue: {},
      validate: (value: unknown) => validateTranslationOverrides(value),
      admin: { description: 'Flat JSON object, e.g. { "nav.home": "Home" }. Only known dictionary keys are allowed.' },
    },
  ],
}
