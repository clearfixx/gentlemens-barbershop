# Integration test is opt-in and requires the isolated Docker database.
$ErrorActionPreference = 'Stop'
# Preserve both existing values and variables that were originally absent.
$previousEnvironment = @{}
foreach ($name in @('NODE_ENV', 'BOOKING_WRITE_TEST_MODE', 'BOOKING_HTTP_ORIGIN', 'DATABASE_URL', 'PAYLOAD_SECRET')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    & "$PSScriptRoot/integration-db.ps1"
    if ($LASTEXITCODE -ne 0) { throw 'Integration database verification failed.' }
    $env:NODE_ENV = 'production'
    node --experimental-strip-types "$PSScriptRoot/test-booking-management.ts"
    if ($LASTEXITCODE -ne 0) { throw 'Booking management integration test failed.' }
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}
