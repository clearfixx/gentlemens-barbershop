# Run from the repository root in PowerShell.
# Deliberately refuse any database except the disposable local integration instance.
[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$expected = 'postgresql://barbershop_test:local-integration-only@127.0.0.1:55432/barbershop_integration'
$env:DATABASE_URL = $expected
$env:PAYLOAD_SECRET = 'local-integration-test-secret-not-for-production'

if ($env:DATABASE_URL -cne $expected) {
    throw 'Refusing to connect to a non-integration database.'
}

$container = 'barbershop-integration-pg17'
$running = docker inspect -f '{{.State.Running}}' $container 2>$null
if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne 'true') {
    throw 'The isolated PostgreSQL container is not running.'
}

$identity = @'
SELECT current_database() || ':' || current_user || ':' ||
       inet_server_port()::text;
'@ | docker exec -i $container psql -X -At -v ON_ERROR_STOP=1 -U barbershop_test -d barbershop_integration
if ($LASTEXITCODE -ne 0 -or $identity.Trim() -ne 'barbershop_integration:barbershop_test:5432') {
    throw 'Database identity verification failed.'
}

Write-Host 'Verified disposable integration database.' -ForegroundColor Green
if ($Apply) {
    Write-Host 'Applying reviewed Payload migrations to isolated integration database only.' -ForegroundColor Yellow
    pnpm exec payload migrate --disable-transpile
} else {
    pnpm exec payload migrate:status --disable-transpile
}
if ($LASTEXITCODE -ne 0) {
    throw 'Payload migration command failed.'
}
