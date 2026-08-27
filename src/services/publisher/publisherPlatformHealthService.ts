import { sql } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  publisherAdClicks,
  publisherAdImpressions,
  publisherAdInventory,
  publisherClaimRequests,
  publisherContentItems,
  publisherFeatureAccess,
  publisherManagedAds,
  publishers,
  publisherSources,
} from '@/db/schema'
import { publisherLog } from '@/lib/publisher/observability'
import { FEATURE_ENV_KEYS, isGlobalFeatureEnabled } from '@/lib/publisher/rolloutMatrix'
import type { PublisherRolloutFeatureKey } from '@/types/publisherRollout'

export interface PublisherPlatformHealthSnapshot {
  publishers: number
  verified: number
  unclaimed: number
  pendingClaims: number
  publisherSources: number
  contentDrafts: number
  contentPublished: number
  inventories: number
  activeManagedAds: number
  impressions: number
  clicks: number
  allowlistEnabledRows: number
  smartFeed: {
    rankingGlobal: boolean
    feedGlobal: boolean
  }
  globals: Record<string, boolean>
  capturedAt: string
}

async function safeCount(query: Promise<Array<{ c: number }>>): Promise<number> {
  try {
    const rows = await query
    return rows[0]?.c ?? 0
  } catch {
    return 0
  }
}

export async function getPublisherPlatformHealth(): Promise<PublisherPlatformHealthSnapshot> {
  const db = getDb()

  const [
    publishersCount,
    verified,
    unclaimed,
    pendingClaims,
    sources,
    drafts,
    published,
    inventories,
    activeAds,
    impressions,
    clicks,
    allowlist,
  ] = await Promise.all([
    safeCount(db.select({ c: sql<number>`count(*)::int` }).from(publishers)),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publishers)
        .where(sql`${publishers.verificationStatus} = 'VERIFIED'`)
    ),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publishers)
        .where(sql`${publishers.status} = 'UNCLAIMED'`)
    ),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publisherClaimRequests)
        .where(sql`${publisherClaimRequests.status} = 'PENDING'`)
    ),
    safeCount(db.select({ c: sql<number>`count(*)::int` }).from(publisherSources)),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publisherContentItems)
        .where(sql`${publisherContentItems.status} = 'DRAFT'`)
    ),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publisherContentItems)
        .where(sql`${publisherContentItems.status} = 'PUBLISHED'`)
    ),
    safeCount(db.select({ c: sql<number>`count(*)::int` }).from(publisherAdInventory)),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publisherManagedAds)
        .where(sql`${publisherManagedAds.status} = 'ACTIVE'`)
    ),
    safeCount(db.select({ c: sql<number>`count(*)::int` }).from(publisherAdImpressions)),
    safeCount(db.select({ c: sql<number>`count(*)::int` }).from(publisherAdClicks)),
    safeCount(
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(publisherFeatureAccess)
        .where(sql`${publisherFeatureAccess.enabled} = true`)
    ),
  ])

  const globals: Record<string, boolean> = {}
  for (const key of Object.keys(FEATURE_ENV_KEYS) as PublisherRolloutFeatureKey[]) {
    globals[key] = isGlobalFeatureEnabled(key)
  }

  const snapshot: PublisherPlatformHealthSnapshot = {
    publishers: publishersCount,
    verified,
    unclaimed,
    pendingClaims,
    publisherSources: sources,
    contentDrafts: drafts,
    contentPublished: published,
    inventories,
    activeManagedAds: activeAds,
    impressions,
    clicks,
    allowlistEnabledRows: allowlist,
    smartFeed: {
      feedGlobal: isGlobalFeatureEnabled('SMART_FEED'),
      rankingGlobal: isGlobalFeatureEnabled('SMART_FEED_RANKING'),
    },
    globals,
    capturedAt: new Date().toISOString(),
  }

  publisherLog('publisher_rollout_health_snapshot', {
    publishers: snapshot.publishers,
    verified: snapshot.verified,
    pendingClaims: snapshot.pendingClaims,
    activeManagedAds: snapshot.activeManagedAds,
    allowlistEnabledRows: snapshot.allowlistEnabledRows,
  })

  return snapshot
}
