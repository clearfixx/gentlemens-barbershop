import type { CollectionConfig, Where } from 'payload'
import { resolveLocationScope } from '../../lib/admin/location-access.ts'

/** Professional content revisions are isolated from commercial tariff approvals.
 * Neither staff nor network admins can mutate this queue through Payload CRUD:
 * future trusted submission and approval services must enforce ownership,
 * snapshot integrity, base revision, audit events and publication transactions.
 */
export const BarberProfileRevisions: CollectionConfig = {
  slug: 'barber-profile-revisions',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['barber', 'location', 'author', 'status', 'createdAt'],
    description: 'Read-only professional content review queue. Published barber data is not changed here.',
  },
  access: {
    read: ({ req }) => {
      if (req.user?.role === 'admin') {
        // Private drafts are not submitted for review and remain invisible.
        const where: Where = { status: { not_equals: 'draft' } }
        return where
      }
      if (req.user?.role === 'location_admin') {
        return resolveLocationScope(req.payload, {
          id: Number(req.user.id), role: 'location_admin',
        }).then(scope => {
          const where: Where = { and: [
            { location: { in: scope.locationIds } },
            { status: { not_equals: 'draft' } },
          ] }
          return where
        }).catch(() => false)
      }
      if (req.user?.role === 'barber') {
        // The barber dashboard will expose private drafts only through a
        // separate verified user↔barber ownership query, not general Payload reads.
        return false
      }
      return false
    },
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'barber', type: 'relationship', relationTo: 'barbers', required: true, index: true },
    { name: 'location', type: 'relationship', relationTo: 'locations', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'baseRevision', type: 'text', required: true, maxLength: 128 },
    { name: 'snapshot', type: 'json', required: true },
    { name: 'changes', type: 'json', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft',
      options: ['draft', 'pending', 'approved', 'rejected'] },
    { name: 'reviewer', type: 'relationship', relationTo: 'users' },
    { name: 'reviewedAt', type: 'date' },
    { name: 'rejectionReason', type: 'textarea', maxLength: 1000 },
    { name: 'appliedRevision', type: 'text', maxLength: 128 },
  ],
}
