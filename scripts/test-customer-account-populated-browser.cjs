/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI browser fixture. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

if (process.env.CI !== 'true') throw new Error('Populated account browser test is CI-only')
const fixture = JSON.parse(fs.readFileSync('/tmp/barbershop-populated-account.json', 'utf8'))
const origin = 'http://localhost:3000'
const bookingId = id => String(fixture.bookings[id].id)
const dateText = (iso, locale) => new Intl.DateTimeFormat(
  locale === 'uk' ? 'uk-UA' : 'en-GB',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' },
).format(new Date(iso))

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
  try {
    for (const [locale, width] of [['uk', 1440], ['en', 375]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + '/' + locale + '/auth', { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill(fixture.email)
      await page.locator('#customer-password').fill(fixture.password)
      await page.locator('.customer-auth__submit').click()
      await page.waitForURL('**/' + locale + '/account', { timeout: 20_000 })

      // Dashboard next-visit card: earliest active future booking, never
      // cancelled, with actual catalog relations instead of fake mockup data.
      const next = page.locator('.account-next')
      assert.match(await next.innerText(), /CI Barber Leon/)
      assert.match(await next.innerText(), /CI Gentlemen Studio/)
      assert.match(await next.innerText(), /CI Classic Haircut/)
      const portrait = next.locator('.account-next__portrait img')
      assert.ok(await portrait.isVisible(), 'Populated visit must show a genuine stored portrait')
      assert.ok(await portrait.evaluate(img => img.complete && img.naturalWidth > 0),
        'Portrait URL must render image bytes, not just a placeholder')
      assert.equal(await page.locator('.account-identity--summary .account-avatar-editor__hint').count(), 0,
        'Profile summary must not display the upload instructions')
      assert.ok((await next.innerText()).includes(
        dateText(fixture.bookings.first.startsAt, locale)),
        'Next visit must be the earliest active booking')
      assert.ok(!(await next.innerText()).includes(
        dateText(fixture.bookings.cancelledFuture.startsAt, locale)),
        'Cancelled future booking must never become next visit')

      // Reviews are available only for an actual completed appointment.
      if (locale === 'uk') {
        const form = page.locator('.account-reviews__form')
        assert.ok(await form.isVisible(), 'Completed visit must enable review form')
        await form.locator('#account-review-comment').fill('Відмінна стрижка, привітний майстер, рекомендую цей барбершоп!')
        await form.getByRole('button', { name: 'Надіслати відгук' }).click()
        await page.getByText('На модерації', { exact: true }).waitFor()
        assert.ok((await page.locator('.account-reviews__list').innerText()).includes('Відмінна стрижка'),
          'Submitted review must persist under the account')
        const validReview = {
          bookingId: fixture.bookings.completedPast.id, rating: 5,
          comment: 'Excellent verified appointment and excellent service!',
        }
        const duplicate = await context.request.post(origin + '/api/account/reviews', { data: validReview })
        assert.equal(duplicate.status(), 409, 'One booking must only have one review')
        const foreign = await context.request.post(origin + '/api/account/reviews', {
          data: { ...validReview, bookingId: fixture.bookings.foreignBooking.id },
        })
        assert.equal(foreign.status(), 404, 'Customer must not review a foreign booking')
        const cancelled = await context.request.post(origin + '/api/account/reviews', {
          data: { ...validReview, bookingId: fixture.bookings.cancelledPast.id },
        })
        assert.equal(cancelled.status(), 409, 'Cancelled booking must never be eligible')
        const forged = await context.request.post(origin + '/api/account/reviews', {
          data: { ...validReview, bookingId: fixture.bookings.first.id, status: 'published' },
        })
        assert.equal(forged.status(), 400, 'Customer must not set moderation status')
      } else {
        assert.ok((await page.locator('.account-reviews__list').innerText()).includes('Excellent') === false,
          'Original submitted Ukrainian review must not be replaced by fabricated English text')
        assert.match(await page.locator('.account-reviews__list').innerText(), /Pending moderation/,
          'Existing review moderation state must be localized')
      }

      const list = page.locator('.account-recent-list li')
      assert.equal(await list.count(), 2, 'All preview is bounded to two rows')
      // Default all = latest by date, including cancelled future booking.
      assert.ok((await list.nth(0).innerText()).includes('CI Classic Haircut'))
      assert.match(await list.nth(0).innerText(), locale === 'uk' ? /Скасовано/ : /Cancelled/)
      const filters = page.locator('.account-overview-filters')
      await filters.getByRole('link', { name: locale === 'uk' ? 'Майбутні' : 'Upcoming' }).click()
      await page.waitForURL('**/account?filter=upcoming#visits')
      assert.equal(await list.count(), 2, 'Two active upcoming bookings expected')
      assert.match(await list.nth(0).innerText(), /CI Classic Haircut/)
      assert.ok((await list.nth(0).innerText()).includes(
        new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB',
          { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Kyiv' })
          .format(new Date(fixture.bookings.first.startsAt))),
        'Upcoming preview must be ordered nearest first')
      assert.ok(!(await page.locator('#visits').innerText()).includes('Cancelled'),
        'Cancelled booking must not appear in upcoming list')
      await filters.getByRole('link', { name: locale === 'uk' ? 'Минулі' : 'Past' }).click()
      await page.waitForURL('**/account?filter=past#visits')
      assert.equal(await list.count(), 2, 'Past preview must show two past bookings')
      assert.match(await list.nth(0).innerText(), locale === 'uk' ? /Завершено/ : /Completed/)
      assert.match(await list.nth(1).innerText(), locale === 'uk' ? /Скасовано/ : /Cancelled/)

      // Continue from selected preview filter into the complete list.
      await page.locator('#visits .account-card-heading a').click()
      await page.waitForURL(/\/account(?:\?.*)?#history$/)
      assert.equal(await page.locator('.account-booking-list li').count(), 5)
      await page.locator('.account-filters').getByRole('link',
        { name: locale === 'uk' ? 'Минулі' : 'Past' }).click()
      await page.waitForURL('**/account?filter=past&historyFilter=past&page=1#history')
      assert.equal(await page.locator('.account-booking-list li').count(), 2)
      await page.locator('.account-filters').getByRole('link',
        { name: locale === 'uk' ? 'Усі' : 'All', exact: true }).click()
      await page.waitForURL('**/account?filter=past&historyFilter=all&page=1#history')
      assert.equal(await page.locator('.account-booking-list li').count(), 5,
        'Only five owner bookings; foreign account must be excluded')
      assert.ok(!(await page.locator('.account-booking-list').innerText()).includes(
        (locale === 'uk' ? 'Запис №' : 'Booking #') + bookingId('foreignBooking')),
        'Foreign booking ID must never be exposed')
      assert.ok((await page.locator('.account-booking-list').innerText()).includes(
        (locale === 'uk' ? 'Запис №' : 'Booking #') + bookingId('completedPast')))

      await page.goto(origin + '/' + locale + '/account?filter=upcoming', { waitUntil: 'networkidle' })
      for (const viewport of (width === 1440 ? [1440, 1920, 1024] : [375, 430])) {
        await page.setViewportSize({ width: viewport, height: 900 })
        const delta = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert.ok(delta <= 1, 'Populated dashboard must fit viewport at ' + viewport)
        if (viewport === 1440 || viewport === 375) {
          await page.screenshot({
            path: '/tmp/barbershop-browser-artifacts/customer-populated-' + locale + '-' + viewport + '.png',
            fullPage: true,
          })
        }
      }
      assert.deepEqual(errors, [], 'No React exceptions with populated bookings')
      console.log('POPULATED CABINET BROWSER OK:', locale, width, 'next visit, filters, scope, responsive')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
