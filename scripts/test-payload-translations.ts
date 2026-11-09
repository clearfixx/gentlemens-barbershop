import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { resolvePublishedMessages } from '../src/i18n/resolve-overrides.ts'

async function main() {
  const payload = await getPayload({ config })
  const existing = await payload.find({
    collection: 'translations',
    where: { locale: { equals: 'en' } },
    overrideAccess: true,
    limit: 1,
  })
  assert.equal(existing.totalDocs, 0, 'Integration test requires an isolated database without EN translation records')
  let id: number | string | undefined
  try {
    const draft = await payload.create({
      collection: 'translations',
      overrideAccess: true,
      data: { locale: 'en', status: 'draft', entries: { 'nav.home': 'Integration test home' } },
    })
    id = draft.id
    assert.equal(resolvePublishedMessages('en', draft).nav.home, 'Home', 'Draft must not be visible')
    const published = await payload.update({
      collection: 'translations',
      id,
      overrideAccess: true,
      data: { status: 'published' },
    })
    const publicRead = await payload.find({
      collection: 'translations',
      where: { and: [{ locale: { equals: 'en' } }, { status: { equals: 'published' } }] },
      overrideAccess: true,
      limit: 1,
    })
    assert.equal(publicRead.docs.length, 1)
    assert.equal(resolvePublishedMessages('en', publicRead.docs[0]).nav.home, 'Integration test home')
    assert.equal(published.status, 'published')
    await payload.update({ collection: 'translations', id, overrideAccess: true, data: { status: 'draft' } })
    const afterUnpublish = await payload.find({
      collection: 'translations',
      where: { and: [{ locale: { equals: 'en' } }, { status: { equals: 'published' } }] },
      overrideAccess: true,
      limit: 1,
    })
    assert.equal(afterUnpublish.docs.length, 0, 'Unpublishing must remove the public override')
    console.info('Payload translation draft/publish/unpublish integration passed')
  } finally {
    if (id !== undefined) await payload.delete({ collection: 'translations', id, overrideAccess: true })
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
