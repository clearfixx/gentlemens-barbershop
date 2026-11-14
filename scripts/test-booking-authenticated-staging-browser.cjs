/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI CommonJS harness. */
/**
 * Signed-in Chromium booking regression. CI only, disposable local staging.
 * Validates a real Payload login cookie, verified-user form prefill, a real
 * booking insert, per-user history and account-scoped idempotent replay.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

const origin = 'http://localhost:3001'
const shop = JSON.parse(fs.readFileSync('/tmp/barbershop-location-true.json', 'utf8')).doc
const barber = JSON.parse(fs.readFileSync('/tmp/barbershop-barber-created.json', 'utf8')).doc
const haircut = JSON.parse(fs.readFileSync('/tmp/barbershop-service-created.json', 'utf8')).doc
const beard = JSON.parse(fs.readFileSync('/tmp/barbershop-second-service.json', 'utf8')).doc
const guestBookingId = Number(fs.readFileSync('/tmp/barbershop-staging-booking-id.txt', 'utf8'))
const customerId = Number(fs.readFileSync('/tmp/barbershop-customer-id', 'utf8'))
const customerEmail = 'customer-ci@example.invalid'
const displayName = 'CI Signed-in Customer'
const phone = '+380671234568'

async function main() {
  if (process.env.CI !== 'true' || process.env.BOOKING_WRITE_TEST_MODE !== 'enabled' ||
      process.env.NODE_ENV !== 'development') {
    throw new Error('Refusing authenticated booking test outside disposable CI staging')
  }
  assert.ok(Number.isSafeInteger(guestBookingId) && guestBookingId > 0)
  assert.ok(Number.isSafeInteger(customerId) && customerId > 0)

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  try {
    // Real login route; do not inject fabricated session identity headers.
    const login = await context.request.post(origin + '/api/users/login', {
      data: { email: customerEmail, password: 'ci-customer-test-password' },
    })
    assert.equal(login.status(), 200, 'CI customer must sign in through Payload')
    const loginBody = await login.json()
    assert.equal(Number(loginBody.user?.id), customerId)
    assert.ok(typeof loginBody.token === 'string' && loginBody.token.length > 20)

    // Update the same disposable test user through authenticated Payload REST
    // to verify server-side displayName prefill, rather than hardcoded UI data.
    const changed = await context.request.patch(origin + '/api/users/' + customerId, {
      headers: { Authorization: 'JWT ' + loginBody.token },
      data: { displayName, phone },
    })
    assert.equal(changed.status(), 200, 'Customer should be able to edit own display name')

    // Payload login normally sets the payload-token cookie in this context.
    // Assert it exists rather than silently relying on a privileged API token.
    const cookies = await context.cookies(origin)
    assert.ok(cookies.some(cookie => cookie.name === 'payload-token' && cookie.value),
      'Customer session cookie must be set by the login endpoint')
    const whoAmI = await context.request.get(origin + '/api/users/me')
    assert.equal(whoAmI.status(), 200)
    assert.equal(Number((await whoAmI.json()).user?.id), customerId)

    const page = await context.newPage()
    const exceptions = []
    page.on('pageerror', error => exceptions.push(error.message))
    const requests = []
    page.on('request', request => {
      if (request.url() === origin + '/api/bookings' && request.method() === 'POST') {
        requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
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
    const date = page.locator('input[type="date"]')
    const today = await date.getAttribute('min')
    const tomorrow = new Date(Date.parse(today + 'T00:00:00.000Z') + 86_400_000).toISOString().slice(0, 10)
    await date.fill(tomorrow)
    const slots = page.locator('.booking-slots button')
    await slots.first().waitFor({ timeout: 20_000 })
    // The guest already reserved the first available 90-minute block.
    // The live availability endpoint must exclude it for the same barber.
    await slots.first().click()
    await page.getByRole('button', { name: 'Продовжити' }).click()
    assert.equal(await page.locator('input[autocomplete="name"]').inputValue(), displayName,
      'Verified account display name must be prefilled')
    assert.equal(await page.locator('input[autocomplete="email"]').inputValue(), customerEmail,
      'Verified account email must be prefilled')
    const phoneField = page.locator('input[autocomplete="tel"]')
    assert.equal(await phoneField.inputValue(), phone,
      'Verified profile phone must be prefilled in the booking wizard')
    // Preserve the prior explicit contact-confirmation interaction. Verify
    // prefill first, then exercise the controlled input like a real customer.
    await phoneField.fill(phone)
    const confirm = page.locator('.booking-actions button[type="submit"]')
    if (await confirm.count() !== 1) {
      fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
      await page.screenshot({
        path: '/tmp/barbershop-browser-artifacts/auth-booking-missing-confirm.png',
        fullPage: true,
      })
      console.error('Unexpected booking wizard step:', (await page.locator('.booking-panel').innerText()).slice(0, 750))
      throw new Error('Booking confirmation action missing after prefilled contact')
    }
    assert.match(await confirm.innerText(), /Підтвердити запис/)
    assert.equal(await confirm.isEnabled(), true)
    const pending = page.waitForResponse(response =>
      response.url() === origin + '/api/bookings' && response.request().method() === 'POST')
    await confirm.click()
    const response = await pending
    if (response.status() !== 201) {
      console.error('Signed-in checkout returned HTTP', response.status(), (await response.text()).slice(0, 250))
    }
    assert.equal(response.status(), 201)
    const receipt = await response.json()
    assert.ok(Number.isSafeInteger(receipt.id) && receipt.id > 0)
    assert.equal(receipt.replayed, false)
    assert.notEqual(receipt.id, guestBookingId)
    await page.getByRole('heading', { name: 'Запис створено' }).waitFor()
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(request.body.customerName, displayName)
    assert.equal(request.body.customerEmail, customerEmail)
    assert.deepEqual(request.body.serviceIds, [Number(haircut.id), Number(beard.id)])
    assert.equal(request.body.customerId, undefined)
    assert.equal(request.body.role, undefined)

    const history = await context.request.get(origin + '/api/bookings/mine?filter=upcoming')
    assert.equal(history.status(), 200, 'Signed-in account should see own booking history')
    const own = await history.json()
    assert.ok(Array.isArray(own.bookings))
    const item = own.bookings.find(item => Number(item.id) === receipt.id)
    assert.ok(item, 'New booking must appear in customer history')
    assert.equal(item.totalPrice, 1150)
    assert.equal(item.status, 'pending')
    assert.deepEqual(item.serviceIds, [Number(haircut.id), Number(beard.id)])
    assert.ok(!own.bookings.some(item => Number(item.id) === guestBookingId),
      'Guest appointment must never appear in an authenticated account history')

    const replay = await context.request.post(origin + '/api/bookings', {
      headers: { 'Idempotency-Key': request.key },
      data: request.body,
    })
    assert.equal(replay.status(), 200)
    assert.deepEqual(await replay.json(), { id: receipt.id, replayed: true })
    const wrongEmail = await context.request.post(origin + '/api/bookings', {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { ...request.body, customerEmail: 'another-user@example.invalid' },
    })
    assert.equal(wrongEmail.status(), 403, 'Signed-in booking must not impersonate another account')

    fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
    await page.screenshot({
      path: '/tmp/barbershop-browser-artifacts/booking-authenticated-staging-confirmation.png',
      fullPage: true,
    })
    fs.writeFileSync('/tmp/barbershop-staging-authenticated-id.txt', String(receipt.id))
    assert.deepEqual(exceptions, [], 'No unhandled browser exceptions')
    console.log('AUTH STAGING BROWSER OK: real login, verified account prefill, ' +
      'real booking, owned history, replay, cross-email rejected')
  } finally {
    await context.close()
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
