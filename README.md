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

See `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` for the initial specification. The Next.js/Payload application is implemented on the working branch.

## Engineering rules

- Feature branches and reviewed pull requests; `main` is stable.
- Do not claim that lint, typecheck, tests or build passed unless executed.
- Business-critical booking, authorization and price validation must be enforced server-side.
- No secrets in Git; use environment variables and an ignored `.env.local`.

## Local development (Windows PowerShell)

Use Node.js 24 (recent patch release), pnpm 10.28.2, and Docker Desktop with Linux containers enabled.

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
# Open .env.local and replace PAYLOAD_SECRET with a long random value.
# Example generator (do not commit or share the output):
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose up -d postgres
pnpm dev
```

**Required:** `.env.local` must define `PAYLOAD_SECRET` and `DATABASE_URL`. Never use the placeholder secret from `.env.example` outside local testing. The app will fail initialization without a real secret; that is intentional. If Docker's database port differs from `5432`, update `DATABASE_URL` accordingly. Confirm the PostgreSQL container is healthy with `docker compose ps`.

Admin panel: http://localhost:3000/admin. Provision the first admin using the documented trusted bootstrap command; do not enable public admin registration.
