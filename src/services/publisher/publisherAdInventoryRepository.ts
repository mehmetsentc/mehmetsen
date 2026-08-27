import { and, desc, eq, ne, sql, count } from 'drizzle-orm'
import { getDb } from '@/db'
import { publisherAdInventory, publisherAdInventoryAudit } from '@/db/schema/publisherAdInventory'
import { newPublisherId } from '@/lib/publisher/id'
import type {
  AdInventoryCreateInput,
  AdInventoryDashboardCounts,
  AdInventoryStatus,
  AdInventoryUpdateInput,
  AdSaleStatus,
  PublisherAdInventoryAuditRecord,
  PublisherAdInventoryRecord,
} from '@/types/publisherAdInventory'

function requireDb() {
  const db = getDb()
  if (!db) throw new Error('DATABASE_URL_REQUIRED')
  return db
}

function mapRow(r: typeof publisherAdInventory.$inferSelect): PublisherAdInventoryRecord {
  return {
    id: r.id,
    publisherId: r.publisherId,
    name: r.name,
    description: r.description,
    inventoryType: r.inventoryType as PublisherAdInventoryRecord['inventoryType'],
    placementScope: r.placementScope as PublisherAdInventoryRecord['placementScope'],
    format: r.format as PublisherAdInventoryRecord['format'],
    semanticSize: r.semanticSize as PublisherAdInventoryRecord['semanticSize'],
    status: r.status as PublisherAdInventoryRecord['status'],
    saleStatus: r.saleStatus as PublisherAdInventoryRecord['saleStatus'],
    pricingModel: r.pricingModel as PublisherAdInventoryRecord['pricingModel'],
    priceMinor: r.priceMinor == null ? null : Number(r.priceMinor),
    currency: r.currency,
    periodDays: r.periodDays,
    impressionCap: r.impressionCap,
    ownershipType: r.ownershipType as PublisherAdInventoryRecord['ownershipType'],
    isPubliclyListed: r.isPubliclyListed,
    layoutItemId: r.layoutItemId,
    articlePolicy: r.articlePolicy as PublisherAdInventoryRecord['articlePolicy'],
    previewNote: r.previewNote,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    archivedAt: r.archivedAt,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export class PublisherAdInventoryRepository {
  async findById(id: string): Promise<PublisherAdInventoryRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(eq(publisherAdInventory.id, id))
      .limit(1)
    return rows[0] ? mapRow(rows[0]) : null
  }

  async listForPublisher(
    publisherId: string,
    opts?: { includeArchived?: boolean; status?: AdInventoryStatus }
  ): Promise<PublisherAdInventoryRecord[]> {
    const db = requireDb()
    const conditions = [eq(publisherAdInventory.publisherId, publisherId)]
    if (!opts?.includeArchived) {
      conditions.push(ne(publisherAdInventory.status, 'ARCHIVED'))
    }
    if (opts?.status) {
      conditions.push(eq(publisherAdInventory.status, opts.status))
    }
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(and(...conditions))
      .orderBy(desc(publisherAdInventory.updatedAt))
    return rows.map(mapRow)
  }

  async listPubliclyAvailable(publisherId: string): Promise<PublisherAdInventoryRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(
        and(
          eq(publisherAdInventory.publisherId, publisherId),
          eq(publisherAdInventory.status, 'ACTIVE'),
          eq(publisherAdInventory.saleStatus, 'AVAILABLE'),
          eq(publisherAdInventory.isPubliclyListed, true)
        )
      )
      .orderBy(desc(publisherAdInventory.updatedAt))
    return rows.map(mapRow)
  }

  async listArticlePolicies(publisherId: string): Promise<PublisherAdInventoryRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(
        and(
          eq(publisherAdInventory.publisherId, publisherId),
          eq(publisherAdInventory.inventoryType, 'ARTICLE'),
          eq(publisherAdInventory.status, 'ACTIVE')
        )
      )
    return rows.map(mapRow)
  }

  async listFeedContracts(publisherId: string): Promise<PublisherAdInventoryRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(
        and(
          eq(publisherAdInventory.publisherId, publisherId),
          eq(publisherAdInventory.inventoryType, 'FEED'),
          eq(publisherAdInventory.status, 'ACTIVE')
        )
      )
    return rows.map(mapRow)
  }

  async dashboardCounts(publisherId: string): Promise<AdInventoryDashboardCounts> {
    const db = requireDb()
    const rows = await db
      .select({
        status: publisherAdInventory.status,
        saleStatus: publisherAdInventory.saleStatus,
        listed: publisherAdInventory.isPubliclyListed,
        c: count(),
      })
      .from(publisherAdInventory)
      .where(eq(publisherAdInventory.publisherId, publisherId))
      .groupBy(
        publisherAdInventory.status,
        publisherAdInventory.saleStatus,
        publisherAdInventory.isPubliclyListed
      )

    const out: AdInventoryDashboardCounts = {
      total: 0,
      active: 0,
      available: 0,
      reserved: 0,
      sold: 0,
      archived: 0,
      publiclyListed: 0,
    }
    for (const row of rows) {
      const n = Number(row.c)
      out.total += n
      if (row.status === 'ARCHIVED') out.archived += n
      if (row.status === 'ACTIVE') out.active += n
      if (row.saleStatus === 'AVAILABLE' && row.status !== 'ARCHIVED') out.available += n
      if (row.saleStatus === 'RESERVED' && row.status !== 'ARCHIVED') out.reserved += n
      if (row.saleStatus === 'SOLD' && row.status !== 'ARCHIVED') out.sold += n
      if (row.listed && row.status !== 'ARCHIVED') out.publiclyListed += n
    }
    return out
  }

  async create(
    publisherId: string,
    userId: string,
    input: AdInventoryCreateInput
  ): Promise<PublisherAdInventoryRecord> {
    const db = requireDb()
    const id = newPublisherId('pad')
    const now = new Date()
    const rows = await db
      .insert(publisherAdInventory)
      .values({
        id,
        publisherId,
        name: input.name,
        description: input.description ?? null,
        inventoryType: input.inventoryType,
        placementScope: input.placementScope,
        format: input.format,
        semanticSize: input.semanticSize ?? 'STANDARD',
        status: 'ACTIVE',
        saleStatus: input.saleStatus ?? 'NOT_FOR_SALE',
        pricingModel: input.pricingModel,
        priceMinor: input.priceMinor ?? null,
        currency: input.currency ?? 'TRY',
        periodDays: input.periodDays ?? null,
        impressionCap: input.impressionCap ?? null,
        ownershipType: 'PUBLISHER',
        isPubliclyListed: input.isPubliclyListed ?? false,
        layoutItemId: input.layoutItemId ?? null,
        articlePolicy: input.articlePolicy ?? null,
        previewNote: input.previewNote ?? null,
        createdBy: userId,
        updatedBy: userId,
        archivedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return mapRow(rows[0]!)
  }

  async update(
    id: string,
    publisherId: string,
    userId: string,
    patch: AdInventoryUpdateInput & { ownershipType?: never }
  ): Promise<PublisherAdInventoryRecord | null> {
    const db = requireDb()
    const existing = await this.findById(id)
    if (!existing || existing.publisherId !== publisherId || existing.status === 'ARCHIVED') {
      return null
    }
    const rows = await db
      .update(publisherAdInventory)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.format !== undefined ? { format: patch.format } : {}),
        ...(patch.semanticSize !== undefined ? { semanticSize: patch.semanticSize } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.saleStatus !== undefined ? { saleStatus: patch.saleStatus } : {}),
        ...(patch.pricingModel !== undefined ? { pricingModel: patch.pricingModel } : {}),
        ...(patch.priceMinor !== undefined ? { priceMinor: patch.priceMinor } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.periodDays !== undefined ? { periodDays: patch.periodDays } : {}),
        ...(patch.impressionCap !== undefined ? { impressionCap: patch.impressionCap } : {}),
        ...(patch.isPubliclyListed !== undefined ? { isPubliclyListed: patch.isPubliclyListed } : {}),
        ...(patch.articlePolicy !== undefined ? { articlePolicy: patch.articlePolicy } : {}),
        ...(patch.previewNote !== undefined ? { previewNote: patch.previewNote } : {}),
        ...(patch.layoutItemId !== undefined ? { layoutItemId: patch.layoutItemId } : {}),
        updatedBy: userId,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(publisherAdInventory.id, id), eq(publisherAdInventory.publisherId, publisherId)))
      .returning()
    return rows[0] ? mapRow(rows[0]) : null
  }

  async archive(id: string, publisherId: string, userId: string): Promise<PublisherAdInventoryRecord | null> {
    const db = requireDb()
    const rows = await db
      .update(publisherAdInventory)
      .set({
        status: 'ARCHIVED',
        isPubliclyListed: false,
        archivedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
        version: sql`${publisherAdInventory.version} + 1`,
      })
      .where(
        and(
          eq(publisherAdInventory.id, id),
          eq(publisherAdInventory.publisherId, publisherId),
          ne(publisherAdInventory.status, 'ARCHIVED')
        )
      )
      .returning()
    return rows[0] ? mapRow(rows[0]) : null
  }

  async detachLayoutItem(layoutItemId: string): Promise<void> {
    const db = requireDb()
    await db
      .update(publisherAdInventory)
      .set({ layoutItemId: null, updatedAt: new Date() })
      .where(eq(publisherAdInventory.layoutItemId, layoutItemId))
  }

  async attachLayoutItem(
    inventoryId: string,
    publisherId: string,
    layoutItemId: string,
    userId: string
  ): Promise<PublisherAdInventoryRecord | null> {
    return this.update(inventoryId, publisherId, userId, { layoutItemId })
  }

  async findByLayoutItemId(layoutItemId: string): Promise<PublisherAdInventoryRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventory)
      .where(eq(publisherAdInventory.layoutItemId, layoutItemId))
      .limit(1)
    return rows[0] ? mapRow(rows[0]) : null
  }

  async writeAudit(opts: {
    inventoryId: string
    publisherId: string
    eventType: string
    actorUserId: string | null
    payload?: Record<string, unknown> | null
  }): Promise<PublisherAdInventoryAuditRecord> {
    const db = requireDb()
    const id = newPublisherId('padaud')
    const rows = await db
      .insert(publisherAdInventoryAudit)
      .values({
        id,
        inventoryId: opts.inventoryId,
        publisherId: opts.publisherId,
        eventType: opts.eventType,
        actorUserId: opts.actorUserId,
        payload: opts.payload ?? null,
        createdAt: new Date(),
      })
      .returning()
    const r = rows[0]!
    return {
      id: r.id,
      inventoryId: r.inventoryId,
      publisherId: r.publisherId,
      eventType: r.eventType,
      actorUserId: r.actorUserId,
      payload: r.payload,
      createdAt: r.createdAt,
    }
  }

  async listAudit(inventoryId: string, limit = 50): Promise<PublisherAdInventoryAuditRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(publisherAdInventoryAudit)
      .where(eq(publisherAdInventoryAudit.inventoryId, inventoryId))
      .orderBy(desc(publisherAdInventoryAudit.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      inventoryId: r.inventoryId,
      publisherId: r.publisherId,
      eventType: r.eventType,
      actorUserId: r.actorUserId,
      payload: r.payload,
      createdAt: r.createdAt,
    }))
  }
}

export const publisherAdInventoryRepository = new PublisherAdInventoryRepository()

export type { AdSaleStatus }
