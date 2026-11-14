# Run from the repository root in PowerShell.
# Refuse any database except the disposable local integration instance.
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
if ($LASTEXITCODE -ne 0 -or @($running)[0].Trim() -ne 'true') {
    throw 'The isolated PostgreSQL container is not running.'
}

# psql inside the container connects through a Unix socket by default.
# inet_server_port() is NULL for socket connections, so do not use it
# to verify the host-side published port.
$identity = @'
SELECT current_database() || ':' || current_user;
'@ | docker exec -i $container psql -X -At -v ON_ERROR_STOP=1 -U barbershop_test -d barbershop_integration
if ($LASTEXITCODE -ne 0 -or (@($identity) -join '').Trim() -ne 'barbershop_integration:barbershop_test') {
    throw 'Database identity verification failed.'
}

$publishedPorts = @(docker port $container '5432/tcp' 2>$null)
if ($LASTEXITCODE -ne 0 -or -not ($publishedPorts | Where-Object { $_ -match '^(127\.0\.0\.1|\[::1\]):55432$' })) {
    throw 'Expected loopback-only PostgreSQL port mapping is missing.'
}

Write-Host 'Verified disposable integration database and loopback port.' -ForegroundColor Green
if ($Apply) {
    Write-Host 'Applying reviewed Payload migrations to isolated integration database only.' -ForegroundColor Yellow
    pnpm exec payload migrate --disable-transpile
} else {
    pnpm exec payload migrate:status --disable-transpile
}
if ($LASTEXITCODE -ne 0) {
    throw 'Payload migration command failed.'
}
