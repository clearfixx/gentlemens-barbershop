# Implementation status

## Committed on feat/app-scaffold

- Next.js/Payload source scaffold and a placeholder home page.
- PostgreSQL development container definition.
- Users collection with self-service access scoped to the authenticated account and admin-only role edits.
- Media collection restricted to admin writes.
- TypeScript path alias for Payload config.

## Verification

GitHub Actions run #25 passed dependency installation, TypeScript typechecking, ESLint and the Next.js production build on Node.js 24 with PostgreSQL 17 available. This confirms the application compiles, **not** that the Payload admin UI, authentication or database operations work end-to-end. A production-server HTTP smoke test for `/` and `/admin` was added subsequently and must pass CI before it can be considered verified. A lockfile is now committed and frozen installation is enabled in CI; browser-level tests remain outstanding.

## Important outstanding concerns

1. Validate the committed Next.js/Payload/React dependency combination on upgrades; the lockfile now pins resolved versions.
2. Bootstrap the first administrator safely. Do not expose admin creation after initialization.
3. Review whether Payload's auth-enabled collection grants access to the admin UI for non-admin users; configure admin access explicitly.
4. Validate role field access under public signup, Local API and REST API.
5. Configure media storage and migration lifecycle.
6. Replace placeholder art with approved licensed/generated assets.
7. Implement booking as transactional domain logic, not direct CRUD from the client.
8. Add authentication, authorization and booking integration tests before merging domain functionality.

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

These are local verification commands; the GitHub Actions checks described above have run, but local and end-to-end verification remain outstanding.
