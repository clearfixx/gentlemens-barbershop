import type { uk } from './uk'

type MessageShape<T> = { -readonly [K in keyof T]: T[K] extends readonly string[] ? readonly string[] : T[K] extends string ? string : MessageShape<T[K]> }

export const en = {
  nav: {
    about: 'About us',
    catalog: 'Catalog',
    booking: 'Plan a visit',
    team: 'Barbers',
    locations: 'Locations',
    home: 'Home',
    primary: 'Main navigation',
  },
  actions: {
    planVisit: 'Plan a visit',
    bookNow: 'Book an appointment',
    back: 'Back',
    continue: 'Continue',
    services: 'Explore services',
  },
  booking: {
    title: 'PLAN YOUR VISIT',
    intro: 'Choose a location, barber and service to view available times. This is a preview; no appointment will be created.',
    steps: ['Location', 'Barber', 'Service', 'Date & time', 'Summary'],
    date: 'Choose a date',
    loading: 'Finding available times…',
    empty: 'No available times on this date.',
    noSubmit: 'No appointment has been created. Sending contact details and confirming bookings are currently disabled.',
    contact: 'Contact details',
    contactIntro: 'Details stay in this browser window and are not sent to the server.',
    name: 'Your name',
    phone: 'Phone',
    email: 'Email (optional)',
    unavailable: 'Unable to check availability.',
    rateLimited: 'Too many requests. Please try again later.',
  },
} satisfies MessageShape<typeof uk>
