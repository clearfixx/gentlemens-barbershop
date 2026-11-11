# Requires a separately running Next.js server on 127.0.0.1:3100,
# started with the same DATABASE_URL and BOOKING_WRITE_TEST_MODE=enabled.
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/integration-db.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Integration database verification failed.' }
$env:NODE_ENV = 'development'
$env:BOOKING_WRITE_TEST_MODE = 'enabled'
$env:BOOKING_HTTP_ORIGIN = 'http://127.0.0.1:3100'
node --experimental-strip-types "$PSScriptRoot/test-booking-management-http.ts"
if ($LASTEXITCODE -ne 0) { throw 'HTTP integration test failed.' }
