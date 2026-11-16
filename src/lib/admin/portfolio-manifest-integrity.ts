import { createHash } from 'node:crypto'
import type { PortfolioSubmissionItem } from './submit-private-portfolio-draft.ts'

export type PortfolioCustodyEntry = {
  id: number
  mime: string
  size: number
  sha: string
}

export function computeSubmittedPortfolioManifest(
  ids: { barberId: number; locationId: number; authorId: number },
  items: PortfolioSubmissionItem[],
  custody: PortfolioCustodyEntry[],
): string {
  if (![ids.barberId, ids.locationId, ids.authorId].every(n =>
    Number.isSafeInteger(n) && n > 0)) throw new RangeError('Invalid portfolio manifest identities')
  const byId = new Map<number, PortfolioCustodyEntry>()
  for (const item of custody) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || byId.has(item.id) ||
      !Number.isSafeInteger(item.size) || item.size < 1 || item.size > 5242880 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(item.mime) ||
      !/^[0-9a-f]{64}$/.test(item.sha)) {
      throw new RangeError('Invalid private media custody manifest')
    }
    byId.set(item.id, item)
  }
  if (items.length === 0 || items.length !== byId.size) {
    throw new RangeError('Portfolio manifest does not match stored media')
  }
  const seenOrder = new Set<number>()
  const seenMedia = new Set<number>()
  for (const item of items) {
    if (!byId.has(item.mediaId) || seenMedia.has(item.mediaId) ||
      seenOrder.has(item.sortOrder)) {
      throw new RangeError('Duplicate, missing or foreign image in portfolio manifest')
    }
    seenOrder.add(item.sortOrder)
    seenMedia.add(item.mediaId)
  }
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  const manifest = sorted.map(item => {
    const media = byId.get(item.mediaId)!
    return { ...item, image: { mime: media.mime, size: media.size, sha: media.sha } }
  })
  return createHash('sha256').update(JSON.stringify([
    'barber-portfolio-manifest-v1', ids.barberId, ids.locationId, ids.authorId, manifest,
  ])).digest('hex')
}
