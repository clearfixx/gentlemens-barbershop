import type { CollectionConfig } from 'payload'
import { assertBookingStatusTransition } from '../../lib/booking/booking-lifecycle.ts'

// Booking writes remain admin-only until server-side availability checks,
// atomic slot reservation and guest identity validation are implemented.
export const Bookings: CollectionConfig = {
  slug: 'bookings',
  hooks: {
    beforeChange: [({ data, operation, originalDoc }) => {
      if (operation === 'create') {
        // All new appointments enter the same state, including trusted Local API writes.
        if (data.status !== undefined && data.status !== 'pending') {
          throw new RangeError('New booking must start as pending')
        }
      } else if (data.status !== undefined) {
        assertBookingStatusTransition(originalDoc?.status, data.status)
      }
      return data
    }],
  },
  admin: { useAsTitle: 'customerName', defaultColumns: ['customerName', 'location', 'barber', 'startsAt', 'status'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'location', type: 'relationship', relationTo: 'locations', required: true },
    { name: 'barber', type: 'relationship', relationTo: 'barbers', required: true },
    { name: 'services', type: 'relationship', relationTo: 'services', hasMany: true, required: true },
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { description: 'Optional registered customer account.' } },
    { name: 'customerName', type: 'text', required: true },
    { name: 'customerPhone', type: 'text', required: true },
    { name: 'customerEmail', type: 'email' },
    { name: 'startsAt', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'endsAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'totalPrice', type: 'number', required: true, min: 0, admin: { description: 'Price snapshot in UAH; not calculated from client input.' } },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'pending',
      options: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    },
    // Internal retry metadata: stored alongside the booking in the same
    // Payload transaction. Not writable through the public/admin REST API.
    {
      name: 'idempotencyScope', type: 'text', maxLength: 160,
      admin: { hidden: true },
      access: { create: () => false, update: () => false, read: () => false },
    },
    {
      name: 'idempotencyKey', type: 'text', maxLength: 160,
      admin: { hidden: true },
      access: { create: () => false, update: () => false, read: () => false },
    },
    {
      name: 'idempotencyRequestHash', type: 'text', maxLength: 64,
      admin: { hidden: true },
      access: { create: () => false, update: () => false, read: () => false },
    },
    { name: 'notes', type: 'textarea' },
  ],
}
