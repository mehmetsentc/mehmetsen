import type { ReactNode } from 'react'
import {
  isArticleAdSlotsEnabled,
  isPublisherAdPublicListingEnabled,
} from '@/lib/publisher/adInventoryFlags'
import { midBodyInsertIndex } from '@/lib/publisher/adInventoryDomain'
import { PublisherAdSlotPlaceholder } from '@/components/publisher/PublisherAdSlotPlaceholder'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'
import { ROUTES } from '@/constants/routes'

export type ArticleAdSlotViews = {
  before: ReactNode | null
  mid: ReactNode | null
  after: ReactNode | null
}

/**
 * Build article ad placeholders from ACTIVE ARTICLE inventory.
 * Flag OFF → all null (zero output). Placeholders are NOT part of JSON-LD body.
 */
export function buildArticleAdSlotViews(
  inventory: PublisherAdInventoryRecord[],
  opts: { publisherSlug?: string | null; blockCount?: number }
): ArticleAdSlotViews {
  if (!isArticleAdSlotsEnabled() || !isPublisherAdPublicListingEnabled()) {
    return { before: null, mid: null, after: null }
  }

  const listed = inventory.filter(
    (i) =>
      i.status === 'ACTIVE' &&
      i.inventoryType === 'ARTICLE' &&
      i.saleStatus === 'AVAILABLE' &&
      i.isPubliclyListed
  )

  const mediaKitHref = opts.publisherSlug
    ? ROUTES.PUBLISHER_REKLAM(opts.publisherSlug)
    : null

  const pick = (policy: 'BEFORE_BODY' | 'MID_BODY' | 'AFTER_BODY') =>
    listed.find((i) => i.articlePolicy === policy || i.placementScope === `ARTICLE_${policy}`)

  const beforeItem = pick('BEFORE_BODY')
  const midItem = pick('MID_BODY')
  const afterItem = pick('AFTER_BODY')

  const midIdx =
    opts.blockCount != null ? midBodyInsertIndex(opts.blockCount) : midBodyInsertIndex(3)

  return {
    before: beforeItem ? (
      <PublisherAdSlotPlaceholder
        key={beforeItem.id}
        name={beforeItem.name}
        semanticSize={beforeItem.semanticSize}
        saleStatus={beforeItem.saleStatus}
        priceMinor={beforeItem.priceMinor}
        currency={beforeItem.currency}
        mediaKitHref={mediaKitHref}
        className="my-4"
      />
    ) : null,
    mid:
      midItem && midIdx != null ? (
        <PublisherAdSlotPlaceholder
          key={midItem.id}
          name={midItem.name}
          semanticSize={midItem.semanticSize}
          saleStatus={midItem.saleStatus}
          priceMinor={midItem.priceMinor}
          currency={midItem.currency}
          mediaKitHref={mediaKitHref}
          className="my-6"
        />
      ) : null,
    after: afterItem ? (
      <PublisherAdSlotPlaceholder
        key={afterItem.id}
        name={afterItem.name}
        semanticSize={afterItem.semanticSize}
        saleStatus={afterItem.saleStatus}
        priceMinor={afterItem.priceMinor}
        currency={afterItem.currency}
        mediaKitHref={mediaKitHref}
        className="my-4"
      />
    ) : null,
  }
}

/** Split block list for mid-body insertion — pure, deterministic. */
export function splitBlocksForMidAd<T>(blocks: T[]): { before: T[]; after: T[]; insertAt: number | null } {
  const insertAt = midBodyInsertIndex(blocks.length)
  if (insertAt == null) return { before: blocks, after: [], insertAt: null }
  return {
    before: blocks.slice(0, insertAt),
    after: blocks.slice(insertAt),
    insertAt,
  }
}
