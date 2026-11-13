import type { CollectionConfig } from 'payload'

/**
 * Immutable operational audit log. Only trusted server-side code using
 * overrideAccess may append entries. CMS users cannot alter history.
 */
export const BookingEvents: CollectionConfig = {
  slug: 'booking-events',
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['booking', 'action', 'actorRole', 'createdAt'],
  },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'booking', type: 'relationship', relationTo: 'bookings', required: true, index: true },
    { name: 'action', type: 'select', required: true, options: ['confirmed', 'completed', 'cancelled', 'no_show'] },
    { name: 'previousStatus', type: 'select', required: true, options: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] },
    { name: 'actor', type: 'relationship', relationTo: 'users' },
    { name: 'actorRole', type: 'select', required: true, options: ['customer', 'assigned_barber', 'admin', 'guest'] },
    { name: 'reason', type: 'textarea' },
  ],
}
