# Scaffold CI

The `Validate scaffold` GitHub Actions workflow installs dependencies, typechecks, lints and builds against a temporary PostgreSQL service.

**Status:** This workflow is an initial verification mechanism, not proof that the application passes. Read the workflow run outcome and logs.

The repository does not yet have a committed lockfile. The workflow uses `pnpm install --no-frozen-lockfile` temporarily; before merging, generate and commit a lockfile from a successful install and switch CI to `--frozen-lockfile`.

If the workflow fails, fix the underlying Next.js/Payload/React integration or version compatibility rather than bypassing checks. Verify the Payload admin interface and initial admin provisioning separately after build passes.

Never commit real production secrets.
