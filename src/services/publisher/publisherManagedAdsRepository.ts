import { and, count, desc, eq, gt, gte, lt, lte, ne, or, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  publisherManagedAds,
  publisherAdCreatives,
  publisherAdImpressions,
  publisherAdClicks,
} from '@/db/schema/publisherManagedAds'
import { publisherAdInventory } from '@/db/schema/publisherAdInventory'
import { publishers } from '@/db/schema/publishers'
import type {
  PublisherAdCreativeRecord,
  PublisherManagedAdRecord,
  PublisherManagedAdStatus,
  PublisherAdAnalyticsSummary,
  ResolvedPublisherAd,
} from '@/types/publisherManagedAds'

function mapAd(row: typeof publisherManagedAds.$inferSelect): PublisherManagedAdRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    inventoryId: row.inventoryId,
    name: row.name,
    advertiserName: row.advertiserName,
    advertiserId: row.advertiserId,
    status: row.status as PublisherManagedAdStatus,
    startAt: row.startAt,
    endAt: row.endAt,
    destinationUrl: row.destinationUrl,
    internalNote: row.internalNote,
    sourceType: (row.sourceType as 'SELF_MANAGED' | 'MARKETPLACE') || 'SELF_MANAGED',
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapCreative(row: typeof publisherAdCreatives.$inferSelect): PublisherAdCreativeRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    adId: row.adId,
    creativeType: row.creativeType as PublisherAdCreativeRecord['creativeType'],
    mediaUrl: row.mediaUrl,
    thumbnailUrl: row.thumbnailUrl,
    headline: row.headline,
    body: row.body,
    altText: row.altText,
    durationSeconds: row.durationSeconds,
    version: row.version,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PublisherManagedAdsRepository {
  async insertAd(ad: PublisherManagedAdRecord): Promise<PublisherManagedAdRecord> {
    const db = getDb()
    await db.insert(publisherManagedAds).values({
      id: ad.id,
      publisherId: ad.publisherId,
      inventoryId: ad.inventoryId,
      name: ad.name,
      advertiserName: ad.advertiserName,
      advertiserId: ad.advertiserId,
      status: ad.status,
      startAt: ad.startAt,
      endAt: ad.endAt,
      destinationUrl: ad.destinationUrl,
      internalNote: ad.internalNote,
      sourceType: ad.sourceType,
      createdBy: ad.createdBy,
      updatedBy: ad.updatedBy,
      archivedAt: ad.archivedAt,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    })
    return ad
  }

  async updateAd(
    id: string,
    publisherId: string,
    patch: Partial<PublisherManagedAdRecord>
  ): Promise<PublisherManagedAdRecord | null> {
    const db = getDb()
    const [row] = await db
      .update(publisherManagedAds)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.advertiserName !== undefined ? { advertiserName: patch.advertiserName } : {}),
        ...(patch.inventoryId !== undefined ? { inventoryId: patch.inventoryId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.startAt !== undefined ? { startAt: patch.startAt } : {}),
        ...(patch.endAt !== undefined ? { endAt: patch.endAt } : {}),
        ...(patch.destinationUrl !== undefined ? { destinationUrl: patch.destinationUrl } : {}),
        ...(patch.internalNote !== undefined ? { internalNote: patch.internalNote } : {}),
        ...(patch.updatedBy !== undefined ? { updatedBy: patch.updatedBy } : {}),
        ...(patch.archivedAt !== undefined ? { archivedAt: patch.archivedAt } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(publisherManagedAds.id, id), eq(publisherManagedAds.publisherId, publisherId)))
      .returning()
    return row ? mapAd(row) : null
  }

  async findAd(id: string): Promise<PublisherManagedAdRecord | null> {
    const db = getDb()
    const [row] = await db.select().from(publisherManagedAds).where(eq(publisherManagedAds.id, id)).limit(1)
    return row ? mapAd(row) : null
  }

  async listAds(
    publisherId: string,
    opts?: { status?: PublisherManagedAdStatus | 'ALL'; includeArchived?: boolean }
  ): Promise<PublisherManagedAdRecord[]> {
    const db = getDb()
    const conditions = [eq(publisherManagedAds.publisherId, publisherId)]
    if (opts?.status && opts.status !== 'ALL') {
      conditions.push(eq(publisherManagedAds.status, opts.status))
    } else if (!opts?.includeArchived) {
      conditions.push(ne(publisherManagedAds.status, 'ARCHIVED'))
    }
    const rows = await db
      .select()
      .from(publisherManagedAds)
      .where(and(...conditions))
      .orderBy(desc(publisherManagedAds.updatedAt))
      .limit(200)
    return rows.map(mapAd)
  }

  async listScheduleConflicts(
    inventoryId: string,
    startAt: Date,
    endAt: Date,
    excludeAdId?: string
  ): Promise<PublisherManagedAdRecord[]> {
    const db = getDb()
    const conditions = [
      eq(publisherManagedAds.inventoryId, inventoryId),
      or(eq(publisherManagedAds.status, 'SCHEDULED'), eq(publisherManagedAds.status, 'ACTIVE'))!,
      lt(publisherManagedAds.startAt, endAt),
      gt(publisherManagedAds.endAt, startAt),
    ]
    if (excludeAdId) conditions.push(ne(publisherManagedAds.id, excludeAdId))
    const rows = await db
      .select()
      .from(publisherManagedAds)
      .where(and(...conditions))
      .limit(20)
    return rows.map(mapAd)
  }

  async findActiveForInventory(
    inventoryId: string,
    now: Date
  ): Promise<PublisherManagedAdRecord | null> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(publisherManagedAds)
      .where(
        and(
          eq(publisherManagedAds.inventoryId, inventoryId),
          or(eq(publisherManagedAds.status, 'ACTIVE'), eq(publisherManagedAds.status, 'SCHEDULED')),
          lte(publisherManagedAds.startAt, now),
          gt(publisherManagedAds.endAt, now)
        )
      )
      .orderBy(desc(publisherManagedAds.updatedAt))
      .limit(1)
    return row ? mapAd(row) : null
  }

  /**
   * Single-query resolve: publisher verified+active, inventory ACTIVE,
   * ad ACTIVE|SCHEDULED in window, current creative present.
   */
  async resolveActiveForInventory(
    inventoryId: string,
    now: Date
  ): Promise<ResolvedPublisherAd | null> {
    const db = getDb()
    const rows = await db
      .select({
        ad: publisherManagedAds,
        creative: publisherAdCreatives,
      })
      .from(publisherManagedAds)
      .innerJoin(
        publisherAdInventory,
        and(
          eq(publisherAdInventory.id, publisherManagedAds.inventoryId),
          eq(publisherAdInventory.status, 'ACTIVE')
        )
      )
      .innerJoin(
        publishers,
        and(
          eq(publishers.id, publisherManagedAds.publisherId),
          eq(publishers.status, 'ACTIVE'),
          eq(publishers.verificationStatus, 'VERIFIED')
        )
      )
      .innerJoin(
        publisherAdCreatives,
        and(
          eq(publisherAdCreatives.adId, publisherManagedAds.id),
          eq(publisherAdCreatives.isCurrent, true)
        )
      )
      .where(
        and(
          eq(publisherManagedAds.inventoryId, inventoryId),
          or(eq(publisherManagedAds.status, 'ACTIVE'), eq(publisherManagedAds.status, 'SCHEDULED')),
          lte(publisherManagedAds.startAt, now),
          gt(publisherManagedAds.endAt, now),
          sql`length(trim(${publisherAdCreatives.mediaUrl})) > 0`
        )
      )
      .orderBy(desc(publisherManagedAds.updatedAt))
      .limit(1)

    const row = rows[0]
    if (!row) return null
    const ad = mapAd(row.ad)
    const creative = mapCreative(row.creative)
    return {
      ad,
      creative,
      clickHref: `/r/ad/${ad.id}`,
    }
  }

  async insertCreative(c: PublisherAdCreativeRecord): Promise<PublisherAdCreativeRecord> {
    const db = getDb()
    if (c.isCurrent) {
      await db
        .update(publisherAdCreatives)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(and(eq(publisherAdCreatives.adId, c.adId), eq(publisherAdCreatives.isCurrent, true)))
    }
    await db.insert(publisherAdCreatives).values({
      id: c.id,
      publisherId: c.publisherId,
      adId: c.adId,
      creativeType: c.creativeType,
      mediaUrl: c.mediaUrl,
      thumbnailUrl: c.thumbnailUrl,
      headline: c.headline,
      body: c.body,
      altText: c.altText,
      durationSeconds: c.durationSeconds,
      version: c.version,
      isCurrent: c.isCurrent,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })
    return c
  }

  async currentCreative(adId: string): Promise<PublisherAdCreativeRecord | null> {
    const db = getDb()
    const [row] = await db
      .select()
      .from(publisherAdCreatives)
      .where(and(eq(publisherAdCreatives.adId, adId), eq(publisherAdCreatives.isCurrent, true)))
      .limit(1)
    return row ? mapCreative(row) : null
  }

  async maxCreativeVersion(adId: string): Promise<number> {
    const db = getDb()
    const [row] = await db
      .select({ v: sql<number>`coalesce(max(${publisherAdCreatives.version}), 0)` })
      .from(publisherAdCreatives)
      .where(eq(publisherAdCreatives.adId, adId))
    return Number(row?.v ?? 0)
  }

  async insertImpression(row: {
    id: string
    adId: string
    creativeId: string
    inventoryId: string
    publisherId: string
    userId: string | null
    sessionId: string | null
    deviceClass: string | null
    referrerType: string | null
    dedupeKey: string | null
  }): Promise<boolean> {
    const db = getDb()
    try {
      await db.insert(publisherAdImpressions).values({
        ...row,
        createdAt: new Date(),
      })
      return true
    } catch {
      return false
    }
  }

  async insertClick(row: {
    id: string
    adId: string
    creativeId: string | null
    inventoryId: string
    publisherId: string
    impressionId: string | null
    userId: string | null
    sessionId: string | null
    destinationUrlSnapshot: string
  }): Promise<void> {
    const db = getDb()
    await db.insert(publisherAdClicks).values({
      ...row,
      createdAt: new Date(),
    })
  }

  async analytics(
    publisherId: string,
    from: Date,
    to: Date,
    adId?: string
  ): Promise<PublisherAdAnalyticsSummary> {
    const db = getDb()
    const impConditions = [
      eq(publisherAdImpressions.publisherId, publisherId),
      gte(publisherAdImpressions.createdAt, from),
      lt(publisherAdImpressions.createdAt, to),
    ]
    const clickConditions = [
      eq(publisherAdClicks.publisherId, publisherId),
      gte(publisherAdClicks.createdAt, from),
      lt(publisherAdClicks.createdAt, to),
    ]
    if (adId) {
      impConditions.push(eq(publisherAdImpressions.adId, adId))
      clickConditions.push(eq(publisherAdClicks.adId, adId))
    }

    const impRows = await db
      .select({
        adId: publisherAdImpressions.adId,
        n: count(),
      })
      .from(publisherAdImpressions)
      .where(and(...impConditions))
      .groupBy(publisherAdImpressions.adId)

    const clickRows = await db
      .select({
        adId: publisherAdClicks.adId,
        n: count(),
      })
      .from(publisherAdClicks)
      .where(and(...clickConditions))
      .groupBy(publisherAdClicks.adId)

    const map = new Map<string, { impressions: number; clicks: number }>()
    for (const r of impRows) {
      map.set(r.adId, { impressions: Number(r.n), clicks: 0 })
    }
    for (const r of clickRows) {
      const cur = map.get(r.adId) || { impressions: 0, clicks: 0 }
      cur.clicks = Number(r.n)
      map.set(r.adId, cur)
    }
    const byAd = [...map.entries()].map(([id, v]) => ({
      adId: id,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    }))
    const impressions = byAd.reduce((s, a) => s + a.impressions, 0)
    const clicks = byAd.reduce((s, a) => s + a.clicks, 0)
    return {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      byAd,
    }
  }

  async tickSchedule(now: Date, limit = 50): Promise<{ activated: number; ended: number }> {
    const db = getDb()
    const activated = await db
      .update(publisherManagedAds)
      .set({ status: 'ACTIVE', updatedAt: now })
      .where(
        and(
          eq(publisherManagedAds.status, 'SCHEDULED'),
          lte(publisherManagedAds.startAt, now),
          gt(publisherManagedAds.endAt, now)
        )
      )
      .returning({ id: publisherManagedAds.id })

    const ended = await db
      .update(publisherManagedAds)
      .set({ status: 'ENDED', updatedAt: now })
      .where(
        and(
          or(eq(publisherManagedAds.status, 'ACTIVE'), eq(publisherManagedAds.status, 'SCHEDULED')),
          lte(publisherManagedAds.endAt, now)
        )
      )
      .returning({ id: publisherManagedAds.id })

    return {
      activated: Math.min(activated.length, limit),
      ended: Math.min(ended.length, limit),
    }
  }
}

export const publisherManagedAdsRepository = new PublisherManagedAdsRepository()
