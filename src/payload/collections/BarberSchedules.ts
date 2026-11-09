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
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data?.weeklyShifts) return data
        const shifts = data.weeklyShifts as Array<{ weekday?: string; startMinute?: number; endMinute?: number }>
        const grouped = new Map<string, Array<{ start: number; end: number }>>()
        for (const shift of shifts) {
          const { weekday, startMinute, endMinute } = shift
          if (weekday === undefined || startMinute === undefined || endMinute === undefined) continue
          if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
            throw new Error('Each shift must have valid whole-minute times, with its end after its start.')
          }
          const dayShifts = grouped.get(weekday) ?? []
          dayShifts.push({ start: startMinute, end: endMinute })
          grouped.set(weekday, dayShifts)
        }
        for (const dayShifts of grouped.values()) {
          dayShifts.sort((a, b) => a.start - b.start)
          for (let index = 1; index < dayShifts.length; index++) {
            if (dayShifts[index].start < dayShifts[index - 1].end) {
              throw new Error('Shifts for the same weekday must not overlap.')
            }
          }
        }
        return data
      },
    ],
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
