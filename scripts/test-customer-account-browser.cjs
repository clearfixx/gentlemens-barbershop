/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI Chromium regression. */
/**
 * End-to-end customer cabinet checks on the same disposable production
 * server, PostgreSQL and Chromium used by the booking browser tests.
 * Tests real login cookies, profile writes, locale routing and responsive UI.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')
const origin = 'http://localhost:3000'

async function run() {
  if (process.env.CI !== 'true') throw new Error('Account browser regression is CI-only')
  fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  try {
    for (const [locale, viewport] of [['uk', { width: 1440, height: 900 }], ['en', { width: 375, height: 812 }]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
      const email = 'browser-cabinet-' + randomUUID().replace(/-/g, '') + '@example.invalid'
      const password = 'ci-test-only-Password-2026!'
      const page = await context.newPage()
      const exceptions = []
      page.on('pageerror', error => exceptions.push(error.message))

      // Registration happens through the actual client UI (not the API
      // shortcut); then sign out and explicitly test the login form.
      await page.goto(origin + '/' + locale + '/auth', { waitUntil: 'networkidle' })
      await page.locator('.customer-auth__tabs button').nth(1).click()
      await page.locator('input[autocomplete="name"]').fill('Cabinet Test')
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('.customer-auth__submit').click()
      await page.waitForURL('**/' + locale + '/account', { timeout: 20_000 })
      await page.locator('.auth-nav__avatar').click()
      await page.getByRole('menuitem', { name: locale === 'uk' ? 'Вийти' : 'Log out' }).click()
      await page.waitForURL('**/' + locale, { timeout: 20_000 })
      await page.goto(origin + '/' + locale + '/auth', { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('.customer-auth__submit').click()
      await page.waitForURL('**/' + locale + '/account', { timeout: 20_000 })
      await page.locator('.account-identity').waitFor()
      assert.ok(await page.getByText(email, { exact: true }).isVisible(), 'Email must come from real account')
      assert.equal(await page.locator('.account-profile-name h2').textContent(), 'Cabinet Test')
      const cookies = await context.cookies(origin)
      assert.ok(cookies.some(cookie => cookie.name === 'payload-token' && cookie.value),
        'Real login must set a Payload session cookie')
      assert.ok(await page.locator('.account-next').isVisible())
      assert.ok(await page.locator('.account-filters a').count() === 3)
      const newName = 'Updated Cabinet ' + locale
      const newPhone = '+380 67 123 45 67'
      await page.locator('.account-profile-pencil').click()
      await page.locator('#account-display-name').fill(newName)
      await page.locator('#account-phone').fill('not-a-phone')
      await page.locator('.account-profile-edit button[type="submit"]').click()
      await page.locator('.account-profile-error').waitFor()
      assert.equal(await page.locator('.account-profile-edit').count(), 1,
        'Invalid profile edits must remain in edit mode')
      await page.locator('#account-phone').fill(newPhone)
      await page.locator('.account-profile-edit button[type="submit"]').click()
      await page.getByRole('heading', { name: newName, exact: true }).waitFor()
      await page.reload({ waitUntil: 'networkidle' })
      assert.equal(await page.locator('.account-profile-name h2').textContent(), newName)
      assert.ok(await page.getByText(newPhone, { exact: true }).isVisible(),
        'Profile phone must survive reload')
      const upcoming = page.locator('.account-filters').getByRole('link', {
        name: locale === 'uk' ? 'Майбутні' : 'Upcoming',
      })
      await upcoming.click()
      await page.waitForURL('**/account?filter=upcoming&page=1#appointments')
      assert.ok(await page.locator('.account-filters .is-active').isVisible())
      assert.equal(await page.locator('.account-booking-list li').count(), 0)
      await page.goto(origin + '/' + locale + '/auth/forgot-password', { waitUntil: 'networkidle' })
      assert.ok(await page.locator('input[type="email"]').isVisible())
      // No external mail: provider failures and request throttling are mocked
      // at the browser boundary to exercise the actual localized UI states.
      await page.route('**/api/users/forgot-password', route =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
      await page.locator('input[type="email"]').fill(email)
      await page.locator('.customer-auth__submit').click()
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').innerText(),
        locale === 'uk' ? /недоступний/i : /unavailable/i)
      await page.unroute('**/api/users/forgot-password')
      await page.goto(origin + '/' + locale + '/auth/reset-password', { waitUntil: 'networkidle' })
      assert.equal(await page.locator('.customer-auth__submit').isDisabled(), true,
        'Reset without a token must be unavailable')
      await page.goto(origin + '/' + locale + '/auth/reset-password?token=ci-invalid-token',
        { waitUntil: 'networkidle' })
      await page.locator('input[autocomplete="new-password"]').nth(0).fill('ci-fresh-password-2026!')
      await page.locator('input[autocomplete="new-password"]').nth(1).fill('ci-fresh-password-2026!')
      await page.route('**/api/users/reset-password', route =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
      await page.locator('.customer-auth__submit').click()
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').innerText(),
        locale === 'uk' ? /недоступний/i : /unavailable/i)
      await page.unroute('**/api/users/reset-password')
      await page.locator('.customer-auth__submit').click()
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').innerText(),
        locale === 'uk' ? /недійсне|минув/i : /invalid|expired/i)
      await page.goto(origin + '/' + locale + '/account', { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.ok(overflow <= 1, 'Account must not overflow viewport at ' + viewport.width + 'px')
      await page.screenshot({
        path: '/tmp/barbershop-browser-artifacts/customer-account-' + locale + '-' + viewport.width + '.png',
        fullPage: true,
      })
      const menu = page.locator('.auth-nav__avatar')
      await menu.waitFor()
      await menu.click()
      await page.getByRole('menuitem', { name: locale === 'uk' ? 'Вийти' : 'Log out' }).click()
      await page.waitForURL('**/' + locale, { timeout: 20_000 })
      await page.goto(origin + '/' + locale + '/account', { waitUntil: 'domcontentloaded' })
      await page.waitForURL('**/' + locale + '/auth', { timeout: 20_000 })
      const anonymousAfterLogout = await context.request.get(origin + '/api/users/me')
      const logoutBody = await anonymousAfterLogout.json()
      assert.ok(!logoutBody.user, 'Sign-out must clear the authenticated session')
      assert.deepEqual(exceptions, [], 'No React exceptions during account auth and editing')
      console.log('CUSTOMER CABINET BROWSER OK:', locale, viewport.width,
        'login, profile edit, reload, history, recovery routes, logout, overflow')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
