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
      assert.deepEqual(errors, [], 'Landing page should not raise runtime errors')
      await page.close()
    }
    console.log('PUBLIC REVIEWS CHROME OK: genuine moderated review in UA and EN desktop/mobile')
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
