import type { CollectionConfig } from 'payload'

// Times are stored as minutes after local midnight (0..1439).
// Location timezone and availability calculation will be handled by the booking service.
export const BarberSchedules: CollectionConfig = {
  slug: 'barber-schedules',
  admin: { useAsTitle: 'label', defaultColumns: ['label', 'barber', 'isActive'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'barber', type: 'relationship', relationTo: 'barbers', required: true, index: true },
    { name: 'isActive', type: 'checkbox', defaultValue: false, required: true },
    {
      name: 'weeklyShifts',
      type: 'array',
      fields: [
        {
          name: 'weekday', type: 'select', required: true,
          options: [
            { label: 'Monday', value: '1' },
            { label: 'Tuesday', value: '2' },
            { label: 'Wednesday', value: '3' },
            { label: 'Thursday', value: '4' },
            { label: 'Friday', value: '5' },
            { label: 'Saturday', value: '6' },
            { label: 'Sunday', value: '0' },
          ],
        },
        { name: 'startMinute', type: 'number', required: true, min: 0, max: 1439, admin: { description: 'Minutes since midnight; 09:00 = 540.' } },
        { name: 'endMinute', type: 'number', required: true, min: 1, max: 1440, admin: { description: 'Exclusive end of shift; 18:00 = 1080.' } },
      ],
    },
  ],
}
