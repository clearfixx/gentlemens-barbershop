# Integration test is opt-in and requires the isolated Docker database.
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/integration-db.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Integration database verification failed.' }
$env:NODE_ENV = 'production'
node --experimental-strip-types "$PSScriptRoot/test-booking-management.ts"
if ($LASTEXITCODE -ne 0) { throw 'Booking management integration test failed.' }
