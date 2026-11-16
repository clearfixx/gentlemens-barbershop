import type { CollectionConfig } from 'payload'

/** Approval requests are persisted in Payload, but state changes and live
 * pricing writes must happen only in a trusted transactional domain service.
 * No Payload REST/GraphQL write access, including network administrators.
 */
export const CommercialChangeRequests: CollectionConfig = {
  slug: 'commercial-change-requests',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['location', 'kind', 'status', 'createdBy', 'createdAt'],
    description: 'Read-only audit queue. Submissions and decisions use guarded domain operations.',
  },
  access: {
    read: ({ req }) => {
      if (req.user?.role === 'admin') return true
      if (req.user?.role === 'location_admin') {
        return { createdBy: { equals: req.user.id } }
      }
      return false
    },
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'location', type: 'relationship', relationTo: 'locations', required: true, index: true },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'kind', type: 'select', required: true,
      options: ['service_price', 'service_duration', 'barber_price', 'barber_duration', 'service_assignment'],
    },
    { name: 'service', type: 'relationship', relationTo: 'services', required: true },
    { name: 'barber', type: 'relationship', relationTo: 'barbers' },
    { name: 'oldValue', type: 'json', required: true },
    { name: 'proposedValue', type: 'json', required: true },
    { name: 'expectedRevision', type: 'text', required: true, maxLength: 128 },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending',
      options: ['pending', 'approved', 'rejected'],
    },
    { name: 'decidedBy', type: 'relationship', relationTo: 'users' },
    { name: 'decidedAt', type: 'date' },
    { name: 'decisionReason', type: 'textarea', maxLength: 1000 },
  ],
}
