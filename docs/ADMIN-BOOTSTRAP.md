# First administrator bootstrap

The public users API is intended for customer signup only. The first administrator must be provisioned from a trusted server shell, never from a public HTTP endpoint.

1. Start PostgreSQL and configure `DATABASE_URL` and `PAYLOAD_SECRET` in the server environment.
2. Supply `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters via secure environment injection. Do not commit credentials.
3. Run `pnpm bootstrap:admin` from the application directory.
4. Remove the bootstrap credentials from the environment after success, then sign in through `/admin`.

The command refuses to run when **any** user already exists, including a customer. This prevents promoting an account created through public registration. If the installation already contains users, do not delete them to bypass this check; provision an administrator using a separately audited, trusted administrative procedure.

The script uses Payload's server-side Local API with `overrideAccess: true`, so access is intentionally limited to operators who can execute code on the application server. This procedure is not yet verified against a live database. Validate it in a disposable environment before production deployment.
