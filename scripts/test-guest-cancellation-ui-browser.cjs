/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI CommonJS browser harness. */
/**
 * UI-only Chromium journey against the actual Next.js staging page.
 * Route interceptions simulate generic 202 and verified 409/200 responses.
 * This script NEVER invokes the real email delivery service or mutates a booking.
 * The server/SQL guest cancellation integration has a separate test.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

const base = 'http://localhost:3001'

async function main() {
  if (process.env.CI !== 'true' || process.env.NODE_ENV !== 'development' ||
      process.env.BOOKING_WRITE_TEST_MODE !== 'enabled') {
    throw new Error('Guest cancellation browser test requires disposable staging')
  }
  fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  try {
    for (const [locale, width] of [['uk', 1366], ['en', 375]]) {
      const context = await browser.newContext({ viewport: { width, height: 840 } })
      const page = await context.newPage()
      const browserErrors = []
      page.on('pageerror', error => browserErrors.push(error.message))
      let requests = 0
      let confirmations = 0
      await page.route('**/api/bookings/guest-cancellation/request', async route => {
        requests++
        assert.deepEqual(route.request().postDataJSON(), {
          bookingId: 42,
          email: 'guest@example.invalid',
        })
        await route.fulfill({
          status: 202, contentType: 'application/json', body: '{"accepted":true}',
        })
      })
      await page.route('**/api/bookings/guest-cancellation/confirm', async route => {
        confirmations++
        assert.deepEqual(route.request().postDataJSON(), { bookingId: 42, code: '01234567' })
        await route.fulfill({
          status: confirmations === 1 ? 409 : 200,
          contentType: 'application/json',
          body: confirmations === 1
            ? '{"error":"Cancellation cannot be verified"}'
            : '{"id":42,"status":"cancelled"}',
        })
      })

      await page.goto(base + '/' + locale + '/booking/cancel?bookingId=42',
        { waitUntil: 'networkidle' })
      assert.equal(await page.locator('#guest-cancel-booking').inputValue(), '42')
      await page.locator('#guest-cancel-email').fill('guest@example.invalid')
      const send = page.locator('.guest-cancel-card').first().locator('button[type="submit"]')
      assert.equal(await send.isEnabled(), true)
      await send.click()
      await page.locator('#guest-cancel-code').waitFor()
      await page.locator('#guest-cancel-code').fill('01234567')
      assert.equal(await page.locator('.guest-cancel-code__cells span').count(), 8)
      assert.equal(await page.locator('.guest-cancel-code__cells span').first().innerText(), '0')
      await page.screenshot({
        path: '/tmp/barbershop-browser-artifacts/guest-cancel-' + locale + '-verify.png',
        fullPage: true,
      })
      const confirm = page.locator('.guest-cancel-card').last().locator('button[type="submit"]')
      await confirm.click()
      const warning = page.locator('.guest-cancel-error[role="alert"]')
      await warning.waitFor()
      assert.equal(confirmations, 1)
      assert.equal(await page.locator('.guest-cancel-success').count(), 0)
      await confirm.click()
      await page.locator('.guest-cancel-success').waitFor()
      assert.equal(requests, 1)
      assert.equal(confirmations, 2)
      assert.equal(await page.locator('.guest-cancel-success__receipt dd').first().innerText(), '42')
      await page.screenshot({
        path: '/tmp/barbershop-browser-artifacts/guest-cancel-' + locale + '-success.png',
        fullPage: true,
      })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.ok(overflow <= 1, 'Cancellation page has horizontal overflow at ' + width + 'px: ' + overflow)
      assert.deepEqual(browserErrors, [], 'No client-side exceptions')
      console.log('GUEST CANCELLATION UI BROWSER OK:', locale, width + 'px',
        'generic request, eight digits, invalid proof, success receipt, no overflow')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
