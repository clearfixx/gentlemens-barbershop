/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI CommonJS script. */
/* Real Chromium regression against a production-built Next.js + Payload server.
 * This script runs only on disposable CI fixtures. It mocks availability
 * responses to exercise the interactive wizard deterministically, while
 * production booking writes remain genuinely blocked.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

const origin = 'http://localhost:3000'
const shop = JSON.parse(fs.readFileSync('/tmp/barbershop-location-true.json', 'utf8')).doc
const barber = JSON.parse(fs.readFileSync('/tmp/barbershop-barber-created.json', 'utf8')).doc
const haircut = JSON.parse(fs.readFileSync('/tmp/barbershop-service-created.json', 'utf8')).doc
const beard = JSON.parse(fs.readFileSync('/tmp/barbershop-second-service.json', 'utf8')).doc

async function run() {
  fs.mkdirSync('/tmp/barbershop-browser-artifacts', { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  try {
    for (const locale of ['uk', 'en']) {
      const mobile = locale === 'en'
      const context = await browser.newContext({
        viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        isMobile: mobile,
      })
      const page = await context.newPage()
      const exceptions = []
      page.on('pageerror', error => exceptions.push(error.message))
      const availabilityRequests = []
      let corrupt = false
      await page.route('**/api/availability?**', async route => {
        const url = new URL(route.request().url())
        const serviceIds = url.searchParams.getAll('service').map(Number)
        availabilityRequests.push(serviceIds)
        const date = url.searchParams.get('date')
        const start = new Date(date + 'T09:00:00.000Z').toISOString()
        const end = new Date(Date.parse(start) + 90 * 60_000).toISOString()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            barberId: Number(barber.id), locationId: Number(shop.id),
            serviceIds: corrupt ? [999] : serviceIds, date,
            timeZone: shop.timeZone || 'Europe/Kyiv',
            price: 1150, durationMinutes: 90,
            slots: [{ startsAt: start, endsAt: end }],
          }),
        })
      })
      const errors = []
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.goto(origin + '/' + locale + '/booking', { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: new RegExp(shop.name) }).click()
      await page.getByRole('button', { name: locale === 'uk' ? 'Продовжити' : 'Continue' }).click()
      await page.getByRole('button', { name: barber.name, exact: true }).click()
      await page.getByRole('button', { name: locale === 'uk' ? 'Продовжити' : 'Continue' }).click()
      await page.getByRole('button', { name: haircut.name, exact: true }).click()
      await page.getByRole('button', { name: beard.name, exact: true }).click()
      assert.equal(await page.getByRole('button', { name: beard.name, exact: true }).getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: locale === 'uk' ? 'Продовжити' : 'Continue' }).click()

      const dateField = page.locator('input[type="date"]')
      const min = await dateField.getAttribute('min')
      assert.match(min, /^\d{4}-\d{2}-\d{2}$/)
      corrupt = true
      await dateField.fill(min)
      await page.getByRole('alert').waitFor()
      assert.equal(await page.locator('.booking-slots button').count(), 0,
        'Malformed availability must not expose bookable slots')
      // A different local date must recover cleanly after the invalid response.
      corrupt = false
      const nextDate = new Date(Date.parse(min + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
      await dateField.fill(nextDate)
      await page.locator('.booking-slots button').first().waitFor()
      assert.ok(availabilityRequests.some(ids =>
        ids.length === 2 && ids.includes(Number(haircut.id)) && ids.includes(Number(beard.id))),
      'Availability must request the entire service combination')
      await page.locator('.booking-slots button').first().click()
      await page.getByRole('button', { name: locale === 'uk' ? 'Продовжити' : 'Continue' }).click()
      const name = page.locator('input[autocomplete="name"]')
      const phone = page.locator('input[autocomplete="tel"]')
      await name.fill('CI Browser Customer')
      await phone.fill('+380671234567')
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), true,
        'Production UI must not let guests send bookings before rollout')
      assert.ok(await page.getByText(locale === 'uk'
        ? /відправлення контактних даних.*вимкнені/i
        : /sending contact details.*disabled/i).count())
      await page.screenshot({
        path: '/tmp/barbershop-browser-artifacts/booking-' + locale + (mobile ? '-mobile' : '-desktop') + '.png',
        fullPage: true,
      })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 1) {
        const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
          .map(node => ({
            name: node.tagName.toLowerCase(),
            className: typeof node.className === 'string' ? node.className : '',
            right: Math.round(node.getBoundingClientRect().right * 10) / 10,
            width: Math.round(node.getBoundingClientRect().width * 10) / 10,
          }))
          .filter(node => node.right > document.documentElement.clientWidth + 1)
          .slice(0, 12))
        console.error('Mobile overflow diagnostics:', JSON.stringify(offenders))
      }
      assert.ok(overflow <= 1, 'Page has horizontal viewport overflow: ' + overflow)
      assert.deepEqual(exceptions, [], 'React/runtime page exceptions')
      assert.deepEqual(errors.filter(text => !text.includes('favicon')), [], 'Browser console errors')
      console.log('BROWSER OK', locale, mobile ? '375px mobile' : '1440px desktop',
        'multiple services, invalid response recovery, read-only production gate, no overflow')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
