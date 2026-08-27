import type { ReactNode } from 'react'
import {
  isArticleAdSlotsEnabled,
  isPublisherAdPublicListingEnabled,
} from '@/lib/publisher/adInventoryFlags'
import {
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import { midBodyInsertIndex } from '@/lib/publisher/adInventoryDomain'
import { PublisherAdSlotPlaceholder } from '@/components/publisher/PublisherAdSlotPlaceholder'
import { PublisherAdRenderer } from '@/components/publisher/PublisherAdRenderer'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'
import type { ResolvedPublisherAd } from '@/types/publisherManagedAds'
import { ROUTES } from '@/constants/routes'

export type ArticleAdSlotViews = {
  before: ReactNode | null
  mid: ReactNode | null
  after: ReactNode | null
}

function toViewModel(resolved: ResolvedPublisherAd) {
  return {
    adId: resolved.ad.id,
    creativeId: resolved.creative.id,
    creativeType: resolved.creative.creativeType,
    mediaUrl: resolved.creative.mediaUrl,
    thumbnailUrl: resolved.creative.thumbnailUrl,
    headline: resolved.creative.headline,
    body: resolved.creative.body,
    altText: resolved.creative.altText,
    advertiserName: resolved.ad.advertiserName,
    clickHref: resolved.clickHref,
  }
}

function renderSlot(
  item: PublisherAdInventoryRecord | undefined,
  resolved: ResolvedPublisherAd | null | undefined,
  mediaKitHref: string | null,
  className: string
): ReactNode | null {
  if (!item) return null
  if (resolved) {
    return (
      <PublisherAdRenderer
        key={`ad-${resolved.ad.id}`}
        ad={toViewModel(resolved)}
        className={className}
        label="Reklam"
      />
    )
  }
  // Sellable placeholder only when publicly listed AVAILABLE
  if (
    isPublisherAdPublicListingEnabled() &&
    item.status === 'ACTIVE' &&
    item.saleStatus === 'AVAILABLE' &&
    item.isPubliclyListed
  ) {
    return (
      <PublisherAdSlotPlaceholder
        key={item.id}
        name={item.name}
        semanticSize={item.semanticSize}
        saleStatus={item.saleStatus}
        priceMinor={item.priceMinor}
        currency={item.currency}
        mediaKitHref={mediaKitHref}
        className={className}
      />
    )
  }
  return null
}

/**
 * Build article ad views: self-managed creative > sellable placeholder > nothing.
 * Flag OFF → all null. Ads are NOT part of JSON-LD body.
 */
export function buildArticleAdSlotViews(
  inventory: PublisherAdInventoryRecord[],
  opts: {
    publisherSlug?: string | null
    blockCount?: number
    /** inventoryId → resolved self-managed ad (when serving enabled) */
    resolvedByInventoryId?: Map<string, ResolvedPublisherAd | null>
  }
): ArticleAdSlotViews {
  if (!isArticleAdSlotsEnabled()) {
    return { before: null, mid: null, after: null }
  }

  const serving =
    isPublisherSelfManagedAdsEnabled() && isPublisherAdServingEnabled()

  const candidates = inventory.filter(
    (i) => i.status === 'ACTIVE' && i.inventoryType === 'ARTICLE'
  )

  const mediaKitHref = opts.publisherSlug
    ? ROUTES.PUBLISHER_REKLAM(opts.publisherSlug)
    : null

  const pick = (policy: 'BEFORE_BODY' | 'MID_BODY' | 'AFTER_BODY') =>
    candidates.find(
      (i) => i.articlePolicy === policy || i.placementScope === `ARTICLE_${policy}`
    )

  const beforeItem = pick('BEFORE_BODY')
  const midItem = pick('MID_BODY')
  const afterItem = pick('AFTER_BODY')

  const midIdx =
    opts.blockCount != null ? midBodyInsertIndex(opts.blockCount) : midBodyInsertIndex(3)

  const resolve = (item?: PublisherAdInventoryRecord) => {
    if (!item || !serving) return null
    return opts.resolvedByInventoryId?.get(item.id) ?? null
  }

  // When serving is off, fall back to P8 placeholder behavior (public listing)
  if (!serving) {
    if (!isPublisherAdPublicListingEnabled()) {
      return { before: null, mid: null, after: null }
    }
    const listed = candidates.filter(
      (i) => i.saleStatus === 'AVAILABLE' && i.isPubliclyListed
    )
    const pickListed = (policy: 'BEFORE_BODY' | 'MID_BODY' | 'AFTER_BODY') =>
      listed.find(
        (i) => i.articlePolicy === policy || i.placementScope === `ARTICLE_${policy}`
      )
    const b = pickListed('BEFORE_BODY')
    const m = pickListed('MID_BODY')
    const a = pickListed('AFTER_BODY')
    return {
      before: b ? (
        <PublisherAdSlotPlaceholder
          key={b.id}
          name={b.name}
          semanticSize={b.semanticSize}
          saleStatus={b.saleStatus}
          priceMinor={b.priceMinor}
          currency={b.currency}
          mediaKitHref={mediaKitHref}
          className="my-4"
        />
      ) : null,
      mid:
        m && midIdx != null ? (
          <PublisherAdSlotPlaceholder
            key={m.id}
            name={m.name}
            semanticSize={m.semanticSize}
            saleStatus={m.saleStatus}
            priceMinor={m.priceMinor}
            currency={m.currency}
            mediaKitHref={mediaKitHref}
            className="my-6"
          />
        ) : null,
      after: a ? (
        <PublisherAdSlotPlaceholder
          key={a.id}
          name={a.name}
          semanticSize={a.semanticSize}
          saleStatus={a.saleStatus}
          priceMinor={a.priceMinor}
          currency={a.currency}
          mediaKitHref={mediaKitHref}
          className="my-4"
        />
      ) : null,
    }
  }

  return {
    before: renderSlot(beforeItem, resolve(beforeItem), mediaKitHref, 'my-4'),
    mid:
      midIdx != null
        ? renderSlot(midItem, resolve(midItem), mediaKitHref, 'my-6')
        : null,
    after: renderSlot(afterItem, resolve(afterItem), mediaKitHref, 'my-4'),
  }
}

/** Split block list for mid-body insertion — pure, deterministic. */
export function splitBlocksForMidAd<T>(blocks: T[]): {
  before: T[]
  after: T[]
  insertAt: number | null
} {
  const insertAt = midBodyInsertIndex(blocks.length)
  if (insertAt == null) return { before: blocks, after: [], insertAt: null }
  return {
    before: blocks.slice(0, insertAt),
    after: blocks.slice(insertAt),
    insertAt,
  }
}
