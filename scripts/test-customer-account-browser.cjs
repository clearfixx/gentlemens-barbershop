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
      const passwordInput = page.locator('#customer-password')
      const visibilityToggle = page.locator('.customer-auth__password-toggle')
      await passwordInput.fill(password)
      assert.equal(await passwordInput.getAttribute('type'), 'password')
      await visibilityToggle.click()
      assert.equal(await passwordInput.getAttribute('type'), 'text',
        'Registration visibility control should reveal the password')
      assert.equal(await passwordInput.inputValue(), password)
      await visibilityToggle.click()
      assert.equal(await passwordInput.getAttribute('type'), 'password',
        'Registration visibility control should mask the password again')
      await page.locator('.customer-auth__submit').click()
      await page.waitForURL('**/' + locale + '/account', { timeout: 20_000 })
      await page.locator('.auth-nav__avatar').click()
      await page.getByRole('menuitem', { name: locale === 'uk' ? 'Вийти' : 'Log out' }).click()
      await page.waitForURL('**/' + locale, { timeout: 20_000 })
      await page.goto(origin + '/' + locale + '/auth', { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(email)
      await page.locator('#customer-password').fill(password)
      assert.equal(await page.locator('#customer-password').getAttribute('type'), 'password',
        'Login must initially mask the password')
      await page.locator('.customer-auth__password-toggle').click()
      assert.equal(await page.locator('#customer-password').getAttribute('type'), 'text',
        'Login visibility control should reveal the password')
      await page.locator('.customer-auth__password-toggle').click()
      assert.equal(await page.locator('#customer-password').getAttribute('type'), 'password')
      await page.locator('.customer-auth__submit').click()
      await page.waitForURL('**/' + locale + '/account', { timeout: 20_000 })
      await page.locator('.account-identity').waitFor()
      assert.ok(await page.getByText(email, { exact: true }).isVisible(), 'Email must come from real account')
      assert.equal(await page.locator('.account-summary-details h3').textContent(), 'Cabinet Test')
      const cookies = await context.cookies(origin)
      assert.ok(cookies.some(cookie => cookie.name === 'payload-token' && cookie.value),
        'Real login must set a Payload session cookie')
      assert.ok(await page.locator('.account-next').isVisible())
      const avatar = page.locator('.account-avatar-editor')
      assert.ok(await avatar.getByRole('button', { name: locale === 'uk' ? 'Змінити аватар' : 'Change avatar' }).isVisible())
      const invalidPhoto = await page.evaluate(async () => {
        const data = new FormData()
        data.set('avatar', new File(['<svg>not an image</svg>'], 'fake.png', { type: 'image/png' }))
        return (await fetch('/api/account/avatar', { method: 'POST', body: data })).status
      })
      assert.equal(invalidPhoto, 415, 'Fake PNG bytes must be rejected')
      const uploadedPhoto = await page.evaluate(async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 64
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Missing canvas')
        context.fillStyle = '#654321'
        context.fillRect(0, 0, 64, 64)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw new Error('Cannot create test PNG')
        const data = new FormData()
        data.set('avatar', new File([blob], 'profile.png', { type: 'image/png' }))
        const response = await fetch('/api/account/avatar', { method: 'POST', body: data })
        return { status: response.status, body: await response.json() }
      })
      assert.equal(uploadedPhoto.status, 200, 'Valid account avatar upload must succeed')
      assert.ok(uploadedPhoto.body.avatarUrl, 'Uploaded avatar must have a URL')
      await page.reload({ waitUntil: 'networkidle' })
      assert.ok(await page.locator('.account-avatar-editor__photo').isVisible(),
        'Stored avatar should render after reload')
      const avatarResponse = await page.request.get(origin + uploadedPhoto.body.avatarUrl)
      assert.equal(avatarResponse.status(), 200, 'Uploaded image must be publicly renderable')
      await avatar.getByRole('button', { name: locale === 'uk' ? 'Прибрати' : 'Remove' }).click()
      await page.locator('.account-avatar-editor__photo').waitFor({ state: 'detached' })
      await page.reload({ waitUntil: 'networkidle' })
      assert.equal(await page.locator('.account-avatar-editor__photo').count(), 0,
        'Removed avatar should not reappear after reload')
      // Exercise the camera control itself, not only a hand-built API request.
      const realImageBase64 = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 48
        canvas.height = 48
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Missing canvas')
        context.fillStyle = '#a57f5b'
        context.fillRect(0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/png').split(',')[1]
      })
      const chosen = page.waitForEvent('filechooser')
      await page.locator('.account-avatar-editor__camera').click()
      const chooser = await chosen
      await chooser.setFiles({
        name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(realImageBase64, 'base64'),
      })
      await page.locator('.account-avatar-editor__photo').waitFor()
      await page.waitForFunction(() => {
        const src = document.querySelector('.auth-nav__avatar-image')?.getAttribute('src') ?? ''
        return src.includes('avatar-') && !src.includes('no-avatar')
      })
      await page.reload({ waitUntil: 'networkidle' })
      assert.ok(await page.locator('.account-avatar-editor__photo').isVisible(),
        'Camera button upload must survive reload')
      assert.equal(await page.locator('.account-sidebar__nav > .account-sidebar__item').count(), 8,
        'All eight approved sidebar entries must be present')
      assert.equal(await page.locator('.account-aside > section').count(), 3,
        'Profile, loyalty and notifications must be in the right column')
      assert.equal(await page.locator('.account-activity-grid > section').count(), 2,
        'History and reviews must be separate adjacent cards')
      await page.locator('.account-card-heading').getByRole('link',
        { name: locale === 'uk' ? 'Редагувати' : 'Edit' }).click()
      await page.waitForURL('**/account?view=profile#profile-editor')
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
      await page.locator('.account-sidebar__nav').getByRole('link', {
        name: locale === 'uk' ? 'Мої записи' : 'My bookings',
      }).click()
      await page.waitForURL('**/account?view=bookings&filter=all&page=1#appointments')
      assert.equal(await page.locator('.account-filters a').count(), 3)
      const upcoming = page.locator('.account-filters').getByRole('link', {
        name: locale === 'uk' ? 'Майбутні' : 'Upcoming',
      })
      await upcoming.click()
      await page.waitForURL('**/account?view=bookings&filter=upcoming&page=1#appointments')
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
      await page.locator('.customer-auth__error').waitFor()
      assert.match(await page.locator('.customer-auth__error').innerText(),
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
      await page.locator('.customer-auth__error').waitFor()
      assert.match(await page.locator('.customer-auth__error').innerText(),
        locale === 'uk' ? /недоступний/i : /unavailable/i)
      await page.unroute('**/api/users/reset-password')
      await page.locator('.customer-auth__submit').click()
      await page.locator('.customer-auth__error').waitFor()
      assert.match(await page.locator('.customer-auth__error').innerText(),
        locale === 'uk' ? /недійсне|минув/i : /invalid|expired/i)
      await page.goto(origin + '/' + locale + '/account', { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.ok(overflow <= 1, 'Account must not overflow viewport at ' + viewport.width + 'px')
      const viewports = locale === 'uk'
        ? [1440, 1920, 1024]
        : [375, 430]
      for (const width of viewports) {
        await page.setViewportSize({ width, height: width < 600 ? 812 : 900 })
        await page.evaluate(() => document.fonts.ready)
        const dimensions = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          columns: getComputedStyle(document.querySelector('.account-shell')).gridTemplateColumns
            .split(' ').length,
        }))
        assert.ok(dimensions.overflow <= 1, 'Account must not overflow at ' + width + 'px')
        if (width >= 1280) {
          assert.equal(dimensions.columns, 3, 'Reference desktop layout must use three columns')
          const [sidebar, center, aside] = await Promise.all([
            page.locator('.account-sidebar').boundingBox(),
            page.locator('.account-content').boundingBox(),
            page.locator('.account-aside').boundingBox(),
          ])
          assert.ok(sidebar && center && aside && sidebar.x < center.x && center.x < aside.x,
            'Desktop sidebar, main and aside must be in the correct order')
        }
        await page.screenshot({
          path: '/tmp/barbershop-browser-artifacts/customer-account-' + locale + '-' + width + '.png',
          fullPage: true,
        })
      }
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
        'three-column dashboard, widgets, signup, avatar, profile, bookings, recovery, logout')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
