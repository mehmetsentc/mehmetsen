import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { userFeatureAccess } from '@/db/schema'
import { newUserId } from '@/lib/user/id'
import type { UserFeatureAccessRecord, UserRolloutFeatureKey } from '@/types/userRollout'

function mapRow(row: typeof userFeatureAccess.$inferSelect): UserFeatureAccessRecord {
  return {
    id: row.id,
    userId: row.userId,
    featureKey: row.featureKey as UserRolloutFeatureKey,
    enabled: row.enabled,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    reason: row.reason,
  }
}

export class UserFeatureAccessRepository {
  async listForUser(userId: string): Promise<UserFeatureAccessRecord[]> {
    const db = getDb()
    const rows = await db
      .select()
      .from(userFeatureAccess)
      .where(eq(userFeatureAccess.userId, userId))
    return rows.map(mapRow)
  }

  async listEnabledKeys(userId: string): Promise<Set<string>> {
    const db = getDb()
    const rows = await db
      .select({ featureKey: userFeatureAccess.featureKey })
      .from(userFeatureAccess)
      .where(
        and(
          eq(userFeatureAccess.userId, userId),
          eq(userFeatureAccess.enabled, true)
        )
      )
    return new Set(rows.map((r) => r.featureKey))
  }

  async listByFeature(featureKey: UserRolloutFeatureKey): Promise<UserFeatureAccessRecord[]> {
    const db = getDb()
    const rows = await db
      .select()
      .from(userFeatureAccess)
      .where(
        and(
          eq(userFeatureAccess.featureKey, featureKey),
          eq(userFeatureAccess.enabled, true)
        )
      )
    return rows.map(mapRow)
  }

  async countEnabledByFeature(): Promise<Array<{ featureKey: string; count: number }>> {
    const db = getDb()
    const rows = await db
      .select({
        featureKey: userFeatureAccess.featureKey,
        count: sql<number>`count(*)::int`,
      })
      .from(userFeatureAccess)
      .where(eq(userFeatureAccess.enabled, true))
      .groupBy(userFeatureAccess.featureKey)
    return rows.map((r) => ({ featureKey: r.featureKey, count: r.count }))
  }

  async upsert(input: {
    userId: string
    featureKey: UserRolloutFeatureKey
    enabled: boolean
    actorId: string
    reason?: string | null
  }): Promise<UserFeatureAccessRecord> {
    const db = getDb()
    const existing = await db
      .select()
      .from(userFeatureAccess)
      .where(
        and(
          eq(userFeatureAccess.userId, input.userId),
          eq(userFeatureAccess.featureKey, input.featureKey)
        )
      )
      .limit(1)

    const now = new Date()
    if (existing[0]) {
      const [updated] = await db
        .update(userFeatureAccess)
        .set({
          enabled: input.enabled,
          updatedAt: now,
          updatedBy: input.actorId,
          reason: input.reason ?? existing[0].reason,
        })
        .where(eq(userFeatureAccess.id, existing[0].id))
        .returning()
      return mapRow(updated)
    }

    const [inserted] = await db
      .insert(userFeatureAccess)
      .values({
        id: newUserId('ufa'),
        userId: input.userId,
        featureKey: input.featureKey,
        enabled: input.enabled,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        reason: input.reason ?? null,
      })
      .returning()
    return mapRow(inserted)
  }

  async revokeAllForUser(userId: string, actorId: string): Promise<number> {
    const db = getDb()
    const rows = await db
      .update(userFeatureAccess)
      .set({
        enabled: false,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(
        and(
          eq(userFeatureAccess.userId, userId),
          eq(userFeatureAccess.enabled, true)
        )
      )
      .returning({ id: userFeatureAccess.id })
    return rows.length
  }
}

export const userFeatureAccessRepository = new UserFeatureAccessRepository()
