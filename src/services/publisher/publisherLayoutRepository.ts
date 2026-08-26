import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  news,
  publisherLayoutItems,
  publisherLayoutSections,
  publisherLayouts,
  rawArticles,
} from '@/db/schema'
import { newPublisherId } from '@/lib/publisher/id'
import type {
  LayoutDraftPayload,
  LayoutStatus,
  LayoutThemeKey,
  PublisherLayoutItemRecord,
  PublisherLayoutRecord,
  PublisherLayoutSectionRecord,
  ResolvedLayoutArticle,
} from '@/types/publisherLayout'
import { normalizeLayoutItemSize, spanForSize } from '@/types/publisherLayout'

const MAX_ARCHIVED_VERSIONS = 10

function mapLayout(row: typeof publisherLayouts.$inferSelect): PublisherLayoutRecord {
  return {
    id: row.id,
    publisherId: row.publisherId,
    name: row.name,
    status: row.status as PublisherLayoutRecord['status'],
    themeKey: row.themeKey as LayoutThemeKey,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  }
}

function mapSection(row: typeof publisherLayoutSections.$inferSelect): PublisherLayoutSectionRecord {
  return {
    id: row.id,
    layoutId: row.layoutId,
    title: row.title,
    slug: row.slug,
    sectionType: row.sectionType as PublisherLayoutSectionRecord['sectionType'],
    position: row.position,
    displayStyle: row.displayStyle,
    isVisible: row.isVisible,
    contentMode: row.contentMode as PublisherLayoutSectionRecord['contentMode'],
    autoConfig: (row.autoConfig as PublisherLayoutSectionRecord['autoConfig']) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapItem(row: typeof publisherLayoutItems.$inferSelect): PublisherLayoutItemRecord {
  return {
    id: row.id,
    layoutId: row.layoutId,
    sectionId: row.sectionId,
    itemType: row.itemType as PublisherLayoutItemRecord['itemType'],
    contentId: row.contentId,
    position: row.position,
    size: row.size as PublisherLayoutItemRecord['size'],
    span: row.span,
    presentation: row.presentation ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function slugifySection(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'section'
}

export class PublisherLayoutRepository {
  private requireDb() {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
    return getDb()
  }

  async findLayoutById(id: string): Promise<PublisherLayoutRecord | null> {
    const db = this.requireDb()
    const rows = await db.select().from(publisherLayouts).where(eq(publisherLayouts.id, id)).limit(1)
    return rows[0] ? mapLayout(rows[0]) : null
  }

  async findDraftLayout(publisherId: string): Promise<PublisherLayoutRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherLayouts)
      .where(and(eq(publisherLayouts.publisherId, publisherId), eq(publisherLayouts.status, 'DRAFT')))
      .limit(1)
    return rows[0] ? mapLayout(rows[0]) : null
  }

  async findPublishedLayout(publisherId: string): Promise<PublisherLayoutRecord | null> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherLayouts)
      .where(
        and(eq(publisherLayouts.publisherId, publisherId), eq(publisherLayouts.status, 'PUBLISHED'))
      )
      .limit(1)
    return rows[0] ? mapLayout(rows[0]) : null
  }

  async listArchivedLayouts(publisherId: string, limit = MAX_ARCHIVED_VERSIONS): Promise<PublisherLayoutRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherLayouts)
      .where(
        and(eq(publisherLayouts.publisherId, publisherId), eq(publisherLayouts.status, 'ARCHIVED'))
      )
      .orderBy(desc(publisherLayouts.version))
      .limit(limit)
    return rows.map(mapLayout)
  }

  async listSectionsForLayout(layoutId: string): Promise<PublisherLayoutSectionRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherLayoutSections)
      .where(eq(publisherLayoutSections.layoutId, layoutId))
      .orderBy(asc(publisherLayoutSections.position))
    return rows.map(mapSection)
  }

  async listItemsForLayout(layoutId: string): Promise<PublisherLayoutItemRecord[]> {
    const db = this.requireDb()
    const rows = await db
      .select()
      .from(publisherLayoutItems)
      .where(eq(publisherLayoutItems.layoutId, layoutId))
      .orderBy(asc(publisherLayoutItems.position))
    return rows.map(mapItem)
  }

  async ensureDraftLayout(publisherId: string, createdBy: string | null): Promise<PublisherLayoutRecord> {
    const existing = await this.findDraftLayout(publisherId)
    if (existing) return existing

    const published = await this.findPublishedLayout(publisherId)
    if (published) {
      return this.cloneLayoutAsDraft(published, createdBy)
    }

    const db = this.requireDb()
    const now = new Date()
    const [row] = await db
      .insert(publisherLayouts)
      .values({
        id: newPublisherId('playout'),
        publisherId,
        name: 'Ana Sayfa',
        status: 'DRAFT',
        themeKey: 'MODERN',
        version: 1,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const layout = mapLayout(row)
    await db.insert(publisherLayoutSections).values({
      id: newPublisherId('psec'),
      layoutId: layout.id,
      title: 'Son Haberler',
      slug: 'son-haberler',
      sectionType: 'LATEST',
      position: 0,
      displayStyle: 'GRID',
      isVisible: true,
      contentMode: 'AUTO',
      autoConfig: { sort: 'newest', limit: 12 },
      createdAt: now,
      updatedAt: now,
    })
    return layout
  }

  async cloneLayoutAsDraft(
    source: PublisherLayoutRecord,
    createdBy: string | null
  ): Promise<PublisherLayoutRecord> {
    const db = this.requireDb()
    const now = new Date()
    const nextVersion = source.status === 'PUBLISHED' ? source.version + 1 : source.version

    const [draftRow] = await db
      .insert(publisherLayouts)
      .values({
        id: newPublisherId('playout'),
        publisherId: source.publisherId,
        name: source.name,
        status: 'DRAFT',
        themeKey: source.themeKey,
        version: nextVersion,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const draft = mapLayout(draftRow)
    const sections = await this.listSectionsForLayout(source.id)
    const items = await this.listItemsForLayout(source.id)
    const sectionIdMap = new Map<string, string>()

    for (const section of sections) {
      const newSectionId = newPublisherId('psec')
      sectionIdMap.set(section.id, newSectionId)
      await db.insert(publisherLayoutSections).values({
        id: newSectionId,
        layoutId: draft.id,
        title: section.title,
        slug: section.slug,
        sectionType: section.sectionType,
        position: section.position,
        displayStyle: section.displayStyle,
        isVisible: section.isVisible,
        contentMode: section.contentMode,
        autoConfig: section.autoConfig,
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const item of items) {
      const mappedSectionId = sectionIdMap.get(item.sectionId)
      if (!mappedSectionId) continue
      await db.insert(publisherLayoutItems).values({
        id: newPublisherId('pitem'),
        layoutId: draft.id,
        sectionId: mappedSectionId,
        itemType: item.itemType,
        contentId: item.contentId,
        position: item.position,
        size: item.size,
        span: item.span,
        presentation: item.presentation,
        createdAt: now,
        updatedAt: now,
      })
    }

    return draft
  }

  async saveDraftLayout(
    layoutId: string,
    publisherId: string,
    payload: LayoutDraftPayload
  ): Promise<PublisherLayoutRecord> {
    const db = this.requireDb()
    const layout = await this.findLayoutById(layoutId)
    if (!layout || layout.publisherId !== publisherId || layout.status !== 'DRAFT') {
      throw new Error('LAYOUT_NOT_EDITABLE')
    }

    const now = new Date()
    await db
      .update(publisherLayouts)
      .set({
        name: payload.name ?? layout.name,
        themeKey: payload.themeKey ?? layout.themeKey,
        updatedAt: now,
      })
      .where(eq(publisherLayouts.id, layoutId))

    if (payload.sections) {
      await db.delete(publisherLayoutItems).where(eq(publisherLayoutItems.layoutId, layoutId))
      await db.delete(publisherLayoutSections).where(eq(publisherLayoutSections.layoutId, layoutId))

      const usedSlugs = new Set<string>()
      for (const [index, sectionInput] of payload.sections.entries()) {
        const sectionId = sectionInput.id?.startsWith('psec_') ? sectionInput.id : newPublisherId('psec')
        let slug = sectionInput.slug?.trim() || slugifySection(sectionInput.title)
        let suffix = 1
        while (usedSlugs.has(slug)) {
          slug = `${slugifySection(sectionInput.title)}-${suffix++}`
        }
        usedSlugs.add(slug)

        await db.insert(publisherLayoutSections).values({
          id: sectionId,
          layoutId,
          title: sectionInput.title,
          slug,
          sectionType: sectionInput.sectionType ?? 'CUSTOM',
          position: sectionInput.position ?? index,
          displayStyle: sectionInput.displayStyle ?? 'GRID',
          isVisible: sectionInput.isVisible ?? true,
          contentMode: sectionInput.contentMode ?? 'MANUAL',
          autoConfig: sectionInput.autoConfig ?? null,
          createdAt: now,
          updatedAt: now,
        })

        const seenArticles = new Set<string>()
        for (const [itemIndex, itemInput] of (sectionInput.items ?? []).entries()) {
          if (itemInput.itemType === 'ARTICLE' || !itemInput.itemType) {
            const contentId = itemInput.contentId?.trim()
            if (!contentId) continue
            if (seenArticles.has(contentId)) continue
            seenArticles.add(contentId)
          }
          const size = normalizeLayoutItemSize(itemInput.size)
          await db.insert(publisherLayoutItems).values({
            id: itemInput.id?.startsWith('pitem_') ? itemInput.id : newPublisherId('pitem'),
            layoutId,
            sectionId,
            itemType: itemInput.itemType ?? 'ARTICLE',
            contentId: itemInput.contentId ?? null,
            position: itemInput.position ?? itemIndex,
            size,
            span: itemInput.span ?? spanForSize(size),
            presentation: itemInput.presentation ?? null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    const updated = await this.findLayoutById(layoutId)
    if (!updated) throw new Error('LAYOUT_NOT_FOUND')
    return updated
  }

  async publishLayoutAtomic(layoutId: string, publisherId: string): Promise<PublisherLayoutRecord> {
    const db = this.requireDb()
    const draft = await this.findLayoutById(layoutId)
    if (!draft || draft.publisherId !== publisherId || draft.status !== 'DRAFT') {
      throw new Error('LAYOUT_NOT_PUBLISHABLE')
    }

    const now = new Date()
    const currentPublished = await this.findPublishedLayout(publisherId)

    if (currentPublished) {
      await db
        .update(publisherLayouts)
        .set({ status: 'ARCHIVED', updatedAt: now })
        .where(eq(publisherLayouts.id, currentPublished.id))
    }

    const [published] = await db
      .update(publisherLayouts)
      .set({ status: 'PUBLISHED', publishedAt: now, updatedAt: now })
      .where(eq(publisherLayouts.id, layoutId))
      .returning()

    await this.trimArchivedVersions(publisherId)
    return mapLayout(published)
  }

  async rollbackToVersion(
    publisherId: string,
    targetLayoutId: string,
    createdBy: string | null
  ): Promise<PublisherLayoutRecord> {
    const target = await this.findLayoutById(targetLayoutId)
    if (!target || target.publisherId !== publisherId || target.status !== 'ARCHIVED') {
      throw new Error('LAYOUT_ROLLBACK_INVALID')
    }

    const draft = await this.ensureDraftLayout(publisherId, createdBy)
    const db = this.requireDb()
    const now = new Date()

    await db.delete(publisherLayoutItems).where(eq(publisherLayoutItems.layoutId, draft.id))
    await db.delete(publisherLayoutSections).where(eq(publisherLayoutSections.layoutId, draft.id))

    const sections = await this.listSectionsForLayout(target.id)
    const items = await this.listItemsForLayout(target.id)
    const sectionIdMap = new Map<string, string>()

    await db
      .update(publisherLayouts)
      .set({
        name: target.name,
        themeKey: target.themeKey,
        version: target.version + 1,
        updatedAt: now,
      })
      .where(eq(publisherLayouts.id, draft.id))

    for (const section of sections) {
      const newSectionId = newPublisherId('psec')
      sectionIdMap.set(section.id, newSectionId)
      await db.insert(publisherLayoutSections).values({
        id: newSectionId,
        layoutId: draft.id,
        title: section.title,
        slug: section.slug,
        sectionType: section.sectionType,
        position: section.position,
        displayStyle: section.displayStyle,
        isVisible: section.isVisible,
        contentMode: section.contentMode,
        autoConfig: section.autoConfig,
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const item of items) {
      const mappedSectionId = sectionIdMap.get(item.sectionId)
      if (!mappedSectionId) continue
      await db.insert(publisherLayoutItems).values({
        id: newPublisherId('pitem'),
        layoutId: draft.id,
        sectionId: mappedSectionId,
        itemType: item.itemType,
        contentId: item.contentId,
        position: item.position,
        size: item.size,
        span: item.span,
        presentation: item.presentation,
        createdAt: now,
        updatedAt: now,
      })
    }

    return (await this.findLayoutById(draft.id))!
  }

  private async trimArchivedVersions(publisherId: string): Promise<void> {
    const db = this.requireDb()
    const archived = await this.listArchivedLayouts(publisherId, 100)
    if (archived.length <= MAX_ARCHIVED_VERSIONS) return
    const toDelete = archived.slice(MAX_ARCHIVED_VERSIONS)
    const ids = toDelete.map((l) => l.id)
    if (!ids.length) return
    await db.delete(publisherLayoutItems).where(inArray(publisherLayoutItems.layoutId, ids))
    await db.delete(publisherLayoutSections).where(inArray(publisherLayoutSections.layoutId, ids))
    await db.delete(publisherLayouts).where(inArray(publisherLayouts.id, ids))
  }

  async resolveArticlesByIds(
    articleIds: string[],
    sourceIds: string[]
  ): Promise<Map<string, ResolvedLayoutArticle>> {
    const out = new Map<string, ResolvedLayoutArticle>()
    if (!articleIds.length) return out

    const db = this.requireDb()
    const uniqueIds = [...new Set(articleIds.filter(Boolean))]
    const newsRows = await db
      .select({
        id: news.id,
        legacyFirestoreId: news.legacyFirestoreId,
        slug: news.slug,
        title: news.title,
        summary: news.summary,
        thumbnailUrl: news.thumbnailUrl,
        coverImageUrl: news.coverImageUrl,
        publishedAt: news.publishedAt,
        categorySlug: sql<string | null>`null`,
        categoryName: sql<string | null>`null`,
      })
      .from(news)
      .where(
        and(
          eq(news.status, 'published'),
          inArray(news.id, uniqueIds)
        )
      )

    const foundIds = new Set<string>()
    for (const row of newsRows) {
      const article: ResolvedLayoutArticle = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        thumbnailUrl: row.coverImageUrl ?? row.thumbnailUrl,
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        publishedAt: row.publishedAt,
      }
      out.set(row.id, article)
      foundIds.add(row.id)
      if (row.legacyFirestoreId) {
        out.set(row.legacyFirestoreId, article)
        foundIds.add(row.legacyFirestoreId)
      }
    }

    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        out.set(id, {
          id,
          slug: '',
          title: 'Silinmiş haber',
          summary: null,
          thumbnailUrl: null,
          categorySlug: null,
          categoryName: null,
          publishedAt: null,
          missing: true,
        })
      }
    }

    if (sourceIds.length) {
      const rawRows = await db
        .select({
          editorialNewsId: rawArticles.editorialNewsId,
          sourceId: rawArticles.sourceId,
        })
        .from(rawArticles)
        .where(
          and(
            inArray(rawArticles.sourceId, sourceIds),
            inArray(rawArticles.editorialNewsId, uniqueIds)
          )
        )
      for (const raw of rawRows) {
        const nid = raw.editorialNewsId
        if (!nid) continue
        const existing = out.get(nid)
        if (existing && !existing.missing) continue
      }
    }

    return out
  }

  async resolveAutoLatestArticles(
    publisherId: string,
    sourceIds: string[],
    config: { sort?: 'newest' | 'oldest'; limit?: number },
    excludeIds: Set<string> = new Set()
  ): Promise<ResolvedLayoutArticle[]> {
    if (!sourceIds.length) return []
    const db = this.requireDb()
    const limit = Math.min(Math.max(config.limit ?? 12, 1), 48)
    const rawRows = await db
      .select({
        editorialNewsId: rawArticles.editorialNewsId,
        title: rawArticles.title,
        publishedAt: rawArticles.publishedAt,
        mainImageUrl: rawArticles.mainImageUrl,
      })
      .from(rawArticles)
      .where(
        and(
          inArray(rawArticles.sourceId, sourceIds),
          eq(rawArticles.editorialStatus, 'PUBLISHED')
        )
      )
      .orderBy(config.sort === 'oldest' ? asc(rawArticles.publishedAt) : desc(rawArticles.publishedAt))
      .limit(limit * 3)

    const newsIds = [
      ...new Set(
        rawRows
          .map((r) => r.editorialNewsId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && !excludeIds.has(id))
      ),
    ].slice(0, limit * 2)

    const articles = await this.resolveArticlesByIds(newsIds, sourceIds)
    const items: ResolvedLayoutArticle[] = []
    const seen = new Set<string>()
    for (const raw of rawRows) {
      const nid = raw.editorialNewsId
      if (!nid || excludeIds.has(nid)) continue
      const article = articles.get(nid)
      if (!article || article.missing) continue
      if (seen.has(article.id)) continue
      seen.add(article.id)
      items.push(article)
      if (items.length >= limit) break
    }
    return items
  }
}

export const publisherLayoutRepository = new PublisherLayoutRepository()
