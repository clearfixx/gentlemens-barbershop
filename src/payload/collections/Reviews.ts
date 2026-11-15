import type { CollectionConfig } from 'payload'

/** Booking-verified customer reviews: public published, private own, admin moderation. */
export const Reviews: CollectionConfig = {
  slug: 'reviews',
  admin: {
    useAsTitle: 'comment',
    defaultColumns: ['rating', 'status', 'barber', 'booking', 'createdAt'],
  },
  access: {
    read: ({ req }) => req.user?.role === 'admin'
      ? true
      : req.user?.role === 'customer'
        ? { or: [{ status: { equals: 'published' } }, { customer: { equals: req.user.id } }] }
        : { status: { equals: 'published' } },
    create: () => false, // Only trusted owner-verified account endpoint can create.
    update: ({ req }) => req.user?.role === 'admin',
    delete: () => false,
  },
  hooks: {
    beforeChange: [({ data, operation, originalDoc }) => {
      if (operation === 'create') {
        if (data.status && data.status !== 'pending') throw new RangeError('New reviews require moderation')
        data.status = 'pending'
        data.publishedAt = null
      } else {
        // The moderator decides status only; never forge the customer, booking,
        // barber, score or original statement.
        for (const key of ['booking', 'customer', 'barber', 'rating', 'comment'] as const) {
          if (data[key] !== undefined && data[key] !== originalDoc?.[key]) {
            throw new RangeError('Review identity and content are immutable')
          }
        }
        if (data.status && !['pending', 'published', 'rejected'].includes(data.status)) {
          throw new RangeError('Invalid moderation status')
        }
        if (data.status === 'published' && originalDoc?.status !== 'published') {
          data.publishedAt = new Date().toISOString()
        } else if (data.status && data.status !== 'published') {
          data.publishedAt = null
        }
      }
      return data
    }],
  },
  fields: [
    { name: 'booking', type: 'relationship', relationTo: 'bookings', required: true, unique: true, index: true },
    { name: 'customer', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'barber', type: 'relationship', relationTo: 'barbers', required: true, index: true },
    { name: 'rating', type: 'number', min: 1, max: 5, required: true },
    { name: 'comment', type: 'textarea', required: true, minLength: 10, maxLength: 1500 },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending',
      options: [
        { label: 'Pending moderation', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
      ] },
    { name: 'publishedAt', type: 'date', admin: { readOnly: true } },
  ],
}
