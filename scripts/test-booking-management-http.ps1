# Requires a separately running Next.js server on 127.0.0.1:3100,
# started with the same isolated DATABASE_URL and BOOKING_WRITE_TEST_MODE=enabled.
$ErrorActionPreference = 'Stop'
# Preserve both existing values and variables that were originally absent.
$previousEnvironment = @{}
foreach ($name in @('NODE_ENV', 'BOOKING_WRITE_TEST_MODE', 'BOOKING_HTTP_ORIGIN', 'DATABASE_URL', 'PAYLOAD_SECRET')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    & "$PSScriptRoot/integration-db.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Integration database verification failed.' }
    $env:NODE_ENV = 'development'
    $env:BOOKING_WRITE_TEST_MODE = 'enabled'
    $env:BOOKING_HTTP_ORIGIN = 'http://127.0.0.1:3100'
    node --experimental-strip-types "$PSScriptRoot/test-booking-management-http.ts"
    if ($LASTEXITCODE -ne 0) { throw 'HTTP integration test failed.' }
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}
