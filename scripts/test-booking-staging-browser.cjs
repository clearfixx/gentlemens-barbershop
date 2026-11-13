/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI CommonJS harness. */
/**
 * Real, non-production HTTP checkout through the Next.js UI and PostgreSQL.
 * Runs ONLY against disposable localhost:3001 CI staging with the existing
 * write gate explicitly enabled; never changes or bypasses production guard.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

const origin = 'http://localhost:3001'
const shop = JSON.parse(fs.readFileSync('/tmp/barbershop-location-true.json', 'utf8')).doc
const barber = JSON.parse(fs.readFileSync('/tmp/barbershop-barber-created.json', 'utf8')).doc
const haircut = JSON.parse(fs.readFileSync('/tmp/barbershop-service-created.json', 'utf8')).doc
const beard = JSON.parse(fs.readFileSync('/tmp/barbershop-second-service.json', 'utf8')).doc

async function main() {
  if (process.env.BOOKING_WRITE_TEST_MODE !== 'enabled' ||
      process.env.CI !== 'true') {
    throw new Error('Refusing live booking writes outside explicitly opted-in CI staging')
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await context.newPage()
    const exceptions = []
    page.on('pageerror', e => exceptions.push(e.message))
    const bookingRequests = []
    page.on('request', request => {
      if (request.url() === origin + '/api/bookings' && request.method() === 'POST') {
        bookingRequests.push({
          key: request.headers()['idempotency-key'],
          body: request.postDataJSON(),
        })
      }
    })
    await page.goto(origin + '/uk/booking', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(shop.name) }).click()
    await page.getByRole('button', { name: 'Продовжити' }).click()
    await page.getByRole('button', { name: barber.name, exact: true }).click()
    await page.getByRole('button', { name: 'Продовжити' }).click()
    await page.getByRole('button', { name: haircut.name, exact: true }).click()
    await page.getByRole('button', { name: beard.name, exact: true }).click()
    await page.getByRole('button', { name: 'Продовжити' }).click()

    const dateField = page.locator('input[type="date"]')
    const today = await dateField.getAttribute('min')
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/)
    const tomorrow = new Date(Date.parse(today + 'T00:00:00.000Z') + 86400000).toISOString().slice(0, 10)
    assert.ok(tomorrow <= await dateField.getAttribute('max'))
    await dateField.fill(tomorrow)
    // Unlike the previous read-only UI test, do NOT intercept availability.
    // Confirm a real 90-minute quote comes from the live Payload/PostgreSQL API.
    const slot = page.locator('.booking-slots button').first()
    await slot.waitFor({ timeout: 20000 })
    assert.match(await page.locator('.booking-date').innerText(), /дату/i)
    await slot.click()
    await page.getByRole('button', { name: 'Продовжити' }).click()
    await page.locator('input[autocomplete="name"]').fill('CI Staging Guest')
    await page.locator('input[autocomplete="tel"]').fill('+380671234567')
    await page.locator('input[autocomplete="email"]').fill('staging-guest@example.invalid')
    const confirm = page.getByRole('button', { name: 'Підтвердити запис' })
    assert.equal(await confirm.isEnabled(), true)
    const firstResponse = page.waitForResponse(response =>
      response.url() === origin + '/api/bookings' && response.request().method() === 'POST')
    await confirm.click()
    const saved = await firstResponse
    assert.equal(saved.status(), 201, 'Guest checkout must create a real booking')
    const { id, replayed } = await saved.json()
    assert.ok(Number.isSafeInteger(id) && id > 0)
    assert.equal(replayed, false)
    await page.getByRole('heading', { name: 'Запис створено' }).waitFor()
    assert.equal(bookingRequests.length, 1)
    const original = bookingRequests[0]
    assert.match(original.key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.deepEqual(original.body.serviceIds, [Number(haircut.id), Number(beard.id)])
    assert.equal(original.body.locationId, Number(shop.id))
    assert.equal(original.body.barberId, Number(barber.id))
    assert.equal(original.body.customerId, undefined)
    assert.equal(original.body.price, undefined)
    assert.ok(original.body.startsAt.endsWith('Z'))

    // A lost response must not create a second booking; changed requests
    // cannot reuse the same retry token.
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': original.key,
    }
    const replay = await context.request.post(origin + '/api/bookings', {
      headers, data: original.body,
    })
    assert.equal(replay.status(), 200, 'Original booking replay must succeed')
    assert.deepEqual(await replay.json(), { id, replayed: true })
    const conflict = await context.request.post(origin + '/api/bookings', {
      headers, data: { ...original.body, customerName: 'Changed CI Guest' },
    })
    assert.equal(conflict.status(), 409, 'Mutating a request under the same key must conflict')

    const history = await context.request.get(origin + '/api/bookings/mine')
    assert.ok([401, 403].includes(history.status()),
      'Guest must not gain access to account-only booking history')

    fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
    await page.screenshot({
      path: '/tmp/barbershop-browser-artifacts/booking-guest-staging-confirmation.png',
      fullPage: true,
    })
    fs.writeFileSync('/tmp/barbershop-staging-booking-id.txt', String(id))
    assert.deepEqual(exceptions, [], 'Browser must not raise unhandled runtime exceptions')
    console.log('STAGING BROWSER OK: guest created real booking, received receipt, ' +
      'idempotent retry, conflict rejected, anonymous history denied')
  } finally {
    await context.close()
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
