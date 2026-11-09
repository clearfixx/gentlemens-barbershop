import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { resolvePublishedMessages } from '../src/i18n/resolve-overrides.ts'
import { getFallbackMessages } from '../src/i18n/messages/index.ts'

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
    assert.equal(resolvePublishedMessages('en', { locale: draft.locale as string, status: draft.status as string, entries: draft.entries }).nav.home, 'Home', 'Draft must not be visible')
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
    assert.equal(resolvePublishedMessages('en', { locale: publicRead.docs[0].locale as string, status: publicRead.docs[0].status as string, entries: publicRead.docs[0].entries }).nav.home, 'Integration test home')
    assert.equal(published.status, 'published')
    assert.equal(resolvePublishedMessages('uk', { locale: 'en', status: 'published', entries: publicRead.docs[0].entries }).nav.home,
      getFallbackMessages('uk').nav.home, 'English overrides must not leak into Ukrainian')
    await assert.rejects(
      payload.update({ collection: 'translations', id, overrideAccess: true, data: { entries: { 'booking.steps': 'Invalid array replacement' } } }),
      'Invalid dictionary shape must be rejected by Payload validation',
    )
    const stillPublished = await payload.findByID({ collection: 'translations', id, overrideAccess: true })
    assert.equal(stillPublished.status, 'published', 'Invalid update must not change publication state')
    assert.deepEqual(stillPublished.entries, { 'nav.home': 'Integration test home' })
    await assert.rejects(
      payload.create({ collection: 'translations', overrideAccess: true, data: { locale: 'en', status: 'draft', entries: {} } }),
      'Only one translation record per locale may exist',
    )
    await assert.rejects(
      payload.create({ collection: 'translations', overrideAccess: false, data: { locale: 'uk', status: 'draft', entries: {} } }),
      'Anonymous callers must not create translations',
    )
    await assert.rejects(
      payload.update({ collection: 'translations', id, overrideAccess: false, data: { status: 'draft' } }),
      'Anonymous callers must not update translations',
    )
    await assert.rejects(
      payload.delete({ collection: 'translations', id, overrideAccess: false }),
      'Anonymous callers must not delete translations',
    )
    await payload.update({ collection: 'translations', id, overrideAccess: true, data: { status: 'draft' } })
    const afterUnpublish = await payload.find({
      collection: 'translations',
      where: { and: [{ locale: { equals: 'en' } }, { status: { equals: 'published' } }] },
      overrideAccess: true,
      limit: 1,
    })
    assert.equal(afterUnpublish.docs.length, 0, 'Unpublishing must remove the public override')
    await assert.rejects(
      payload.find({ collection: 'translations', overrideAccess: false, limit: 10 }),
      'Anonymous callers must not read admin translation documents',
    )
    console.info('Payload translation draft/publish/unpublish integration passed')
  } finally {
    if (id !== undefined) await payload.delete({ collection: 'translations', id, overrideAccess: true })
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
