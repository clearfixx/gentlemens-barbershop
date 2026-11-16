/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI browser fixture. */
const assert = require('node:assert/strict')
const { chromium } = require('/tmp/barbershop-playwright/node_modules/playwright')

if (process.env.CI !== 'true') throw new Error('Public review browser check is CI-only')

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
  try {
    for (const [locale, width] of [['uk', 1440], ['en', 375]]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const response = await page.goto('http://localhost:3000/' + locale, { waitUntil: 'networkidle' })
      assert.equal(response.status(), 200)
      const section = page.locator('#reviews')
      assert.equal(await section.locator('.home-review-preview--published').count(), 1,
        'Only the moderated published review should render, not placeholders or pending reviews')
      assert.match(await section.innerText(), /Відмінна стрижка/)
      assert.equal(await section.locator('.home-review-preview__stars svg').count(), 5)
      assert.equal(await section.locator('.home-review-preview__comment').count(), 1)
      assert.equal(await section.locator('.home-review-preview__date').count(), 1)
      assert.equal(await section.locator('.home-section__note').count(), 0)
      const barberOptions = section.locator('#home-reviews-barber option')
      assert.ok(await barberOptions.count() >= 2, 'Public barber filter should offer the actual visit barber')
      const barberId = await barberOptions.filter({ hasText: 'CI Barber Leon' }).first().getAttribute('value')
      assert.match(barberId, /^\d+$/)
      const filtered = await page.goto('http://localhost:3000/' + locale + '?reviewBarber=' + barberId + '#reviews',
        { waitUntil: 'networkidle' })
      assert.equal(filtered.status(), 200)
      assert.equal(await section.locator('#home-reviews-barber').inputValue(), barberId)
      assert.equal(await section.locator('.home-review-preview--published').count(), 1,
        'Filtered published review must remain visible for its actual barber')
      const invalid = await page.goto('http://localhost:3000/' + locale + '?reviewBarber=not-an-id#reviews',
        { waitUntil: 'networkidle' })
      assert.equal(invalid.status(), 200)
      assert.equal(await section.locator('#home-reviews-barber').inputValue(), '',
        'Invalid barber filter should fall back to published reviews, not an error')
      assert.equal(await section.locator('.home-review-preview--published').count(), 1)
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      assert.equal(overflow, false, 'Reviews must not cause horizontal overflow at ' + width + 'px')
      await page.locator('.theme-toggle').first().click()
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark',
        'Theme control must apply dark mode without breaking the reviews section')
      assert.equal(await section.locator('.home-review-preview--published').count(), 1)
      const darkOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      assert.equal(darkOverflow, false, 'Dark theme reviews must not overflow at ' + width + 'px')
      assert.deepEqual(errors, [], 'Landing page should not raise runtime errors')
      await page.close()
    }
    console.log('PUBLIC REVIEWS CHROME OK: genuine moderated review in UA and EN desktop/mobile')
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
