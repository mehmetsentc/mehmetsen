import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { publisherFeatureAccess } from '@/db/schema'
import { newPublisherId } from '@/lib/publisher/id'
import type {
  PublisherFeatureAccessRecord,
  PublisherRolloutFeatureKey,
} from '@/types/publisherRollout'

function mapRow(row: typeof publisherFeatureAccess.$inferSelect): PublisherFeatureAccessRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    featureKey: row.featureKey as PublisherRolloutFeatureKey,
    enabled: row.enabled,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    note: row.note,
  }
}

export class PublisherFeatureAccessRepository {
  async listForPublisher(publisherId: string): Promise<PublisherFeatureAccessRecord[]> {
    const db = getDb()
    const rows = await db
      .select()
      .from(publisherFeatureAccess)
      .where(eq(publisherFeatureAccess.publisherId, publisherId))
    return rows.map(mapRow)
  }

  async listEnabledKeys(publisherId: string): Promise<Set<string>> {
    const db = getDb()
    const rows = await db
      .select({ featureKey: publisherFeatureAccess.featureKey })
      .from(publisherFeatureAccess)
      .where(
        and(
          eq(publisherFeatureAccess.publisherId, publisherId),
          eq(publisherFeatureAccess.enabled, true)
        )
      )
    return new Set(rows.map((r) => r.featureKey))
  }

  async listByFeature(featureKey: PublisherRolloutFeatureKey): Promise<PublisherFeatureAccessRecord[]> {
    const db = getDb()
    const rows = await db
      .select()
      .from(publisherFeatureAccess)
      .where(
        and(
          eq(publisherFeatureAccess.featureKey, featureKey),
          eq(publisherFeatureAccess.enabled, true)
        )
      )
    return rows.map(mapRow)
  }

  async countEnabledByFeature(): Promise<Array<{ featureKey: string; count: number }>> {
    const db = getDb()
    const rows = await db
      .select({
        featureKey: publisherFeatureAccess.featureKey,
        count: sql<number>`count(*)::int`,
      })
      .from(publisherFeatureAccess)
      .where(eq(publisherFeatureAccess.enabled, true))
      .groupBy(publisherFeatureAccess.featureKey)
    return rows.map((r) => ({ featureKey: r.featureKey, count: r.count }))
  }

  async upsert(input: {
    publisherId: string
    featureKey: PublisherRolloutFeatureKey
    enabled: boolean
    actorId: string
    note?: string | null
  }): Promise<PublisherFeatureAccessRecord> {
    const db = getDb()
    const existing = await db
      .select()
      .from(publisherFeatureAccess)
      .where(
        and(
          eq(publisherFeatureAccess.publisherId, input.publisherId),
          eq(publisherFeatureAccess.featureKey, input.featureKey)
        )
      )
      .limit(1)

    const now = new Date()
    if (existing[0]) {
      const [updated] = await db
        .update(publisherFeatureAccess)
        .set({
          enabled: input.enabled,
          updatedAt: now,
          updatedBy: input.actorId,
          note: input.note ?? existing[0].note,
        })
        .where(eq(publisherFeatureAccess.id, existing[0].id))
        .returning()
      return mapRow(updated)
    }

    const [inserted] = await db
      .insert(publisherFeatureAccess)
      .values({
        id: newPublisherId('pfa'),
        publisherId: input.publisherId,
        featureKey: input.featureKey,
        enabled: input.enabled,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        note: input.note ?? null,
      })
      .returning()
    return mapRow(inserted)
  }
}

export const publisherFeatureAccessRepository = new PublisherFeatureAccessRepository()
