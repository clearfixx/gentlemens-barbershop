# Implementation status

## Committed on feat/app-scaffold

- Next.js/Payload source scaffold and a placeholder home page.
- PostgreSQL development container definition.
- Users collection with self-service access scoped to the authenticated account and admin-only role edits.
- Media collection restricted to admin writes.
- TypeScript path alias for Payload config.

## Not yet verified

No package install, generated lockfile, lint, typecheck, build, DB connection or end-to-end tests have run. In particular, Payload Next.js admin route/layout imports must be validated against the installed version. Treat this branch as **not runnable until verified**.

## Important outstanding concerns

1. Pin mutually compatible Next.js/Payload/React versions based on the current official Payload starter, not broad major ranges.
2. Bootstrap the first administrator safely. Do not expose admin creation after initialization.
3. Review whether Payload's auth-enabled collection grants access to the admin UI for non-admin users; configure admin access explicitly.
4. Validate role field access under public signup, Local API and REST API.
5. Configure media storage and migration lifecycle.
6. Replace placeholder art with approved licensed/generated assets.
7. Implement booking as transactional domain logic, not direct CRUD from the client.
8. Add a CI workflow only after package installation and baseline checks succeed.

## Suggested local verification

```bash
corepack enable
pnpm install
docker compose up -d postgres
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

The commands above are a verification plan, **not** a record of successful execution.
