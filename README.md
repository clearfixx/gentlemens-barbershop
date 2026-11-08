# Gentlemen's Barbershop

Premium multi-location barbershop booking and management platform.

## Product scope

- Public marketing website with light/dark themes
- Five-step booking flow, customer profiles and appointment history
- Barber dashboard, schedules and appointment management
- Administrator operations and content management
- Small product catalog and news

## Architecture direction

- Next.js App Router and TypeScript
- Tailwind CSS and shadcn/ui
- Payload CMS and PostgreSQL
- Zustand for shared client UI state; TanStack Query only where client-side server caching is warranted
- React Hook Form and Zod for forms

See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` in the foundation branch for the initial specification. No runtime application has been scaffolded yet.

## Engineering rules

- Feature branches and reviewed pull requests; `main` is stable.
- Do not claim that lint, typecheck, tests or build passed unless executed.
- Business-critical booking, authorization and price validation must be enforced server-side.
- No secrets in Git; use environment variables and an ignored `.env.local`.
