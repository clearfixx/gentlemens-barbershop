import type { CollectionConfig } from 'payload'
import { assertValidLocationAssignment } from '../../lib/admin/validate-location-assignment.ts'

/** A manager may be assigned to several branches. Only network admins can
 * change assignments; the public API must not allow self-escalation.
 */
export const LocationAssignments: CollectionConfig = {
  slug: 'location-assignments',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['user', 'location', 'isActive', 'updatedAt'],
    description: 'Location administrator assignments. Only network administrators can grant or revoke access.',
  },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [async ({ data, originalDoc, req }) => {
      const userId = data?.user ?? originalDoc?.user
      const locationId = data?.location ?? originalDoc?.location
      await assertValidLocationAssignment(req.payload, userId, locationId)
      return data
    }],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'location', type: 'relationship', relationTo: 'locations', required: true, index: true },
    { name: 'isActive', type: 'checkbox', required: true, defaultValue: true },
  ],
}
