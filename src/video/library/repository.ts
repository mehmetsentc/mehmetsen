import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { videoLibraryItems } from '@/db/schema/videoLibrary'
import { newVideoLibraryId } from '@/video/domain/ids'
import type {
  VideoLibraryItem,
  VideoLibraryStatus,
  VideoMetadata,
  VideoPlatform,
  VideoRightsStatus,
} from '@/video/domain/types'
import type { VideoDedupKeys } from '@/video/domain/dedup'
import type { VideoLibraryListQuery, VideoLibraryRepository } from './types'

function mapRow(row: typeof videoLibraryItems.$inferSelect): VideoLibraryItem {
  return {
    id: row.id,
    platform: row.platform as VideoPlatform,
    platformVideoId: row.platformVideoId,
    originalUrl: row.originalUrl,
    normalizedUrl: row.normalizedUrl,
    sourceProfileId: row.sourceProfileId,
    sourceUsername: row.sourceUsername,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    title: row.title,
    description: row.description,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspectRatio,
    thumbnailUrl: row.thumbnailUrl,
    posterStorageKey: row.posterStorageKey,
    originalStorageKey: row.originalStorageKey,
    playbackStorageKey: row.playbackStorageKey,
    streamManifestKey: row.streamManifestKey,
    renditions: row.renditions ?? [],
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    publishedAt: row.publishedAt,
    importedAt: row.importedAt,
    publishedNewsId: row.publishedNewsId,
    status: row.status as VideoLibraryStatus,
    rightsStatus: row.rightsStatus as VideoRightsStatus,
    contentHash: row.contentHash,
    tags: row.tags ?? [],
    importErrorCode: row.importErrorCode,
    importErrorMessage: row.importErrorMessage,
    lastImportJobId: row.lastImportJobId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createDrizzleVideoLibraryRepository(): VideoLibraryRepository {
  return {
    async findByDedup(keys: VideoDedupKeys) {
      if (!hasDatabaseUrl()) return null
      const db = getDb()
      if (keys.platformVideoId) {
        const byPlatform = await db
          .select()
          .from(videoLibraryItems)
          .where(
            and(
              eq(videoLibraryItems.platform, keys.platform),
              eq(videoLibraryItems.platformVideoId, keys.platformVideoId)
            )
          )
          .limit(1)
        if (byPlatform[0]) return mapRow(byPlatform[0])
      }
      const byUrl = await db
        .select()
        .from(videoLibraryItems)
        .where(eq(videoLibraryItems.normalizedUrl, keys.normalizedUrl))
        .limit(1)
      if (byUrl[0]) return mapRow(byUrl[0])
      if (keys.contentHash) {
        const byHash = await db
          .select()
          .from(videoLibraryItems)
          .where(eq(videoLibraryItems.contentHash, keys.contentHash))
          .limit(1)
        if (byHash[0]) return mapRow(byHash[0])
      }
      return null
    },

    async insertInspected(input: { metadata: VideoMetadata; createdBy: string }) {
      if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
      const db = getDb()
      const now = new Date()
      const id = newVideoLibraryId('vli')
      const m = input.metadata
      const rows = await db
        .insert(videoLibraryItems)
        .values({
          id,
          platform: m.platform,
          platformVideoId: m.platformVideoId,
          originalUrl: m.originalUrl,
          normalizedUrl: m.normalizedUrl,
          sourceProfileId: m.source.sourceProfileId,
          sourceUsername: m.source.sourceUsername,
          sourceName: m.source.sourceName,
          sourceUrl: m.source.sourceUrl,
          title: m.title ?? '',
          description: m.description,
          durationMs: m.durationMs,
          width: m.width,
          height: m.height,
          aspectRatio: m.aspectRatio,
          thumbnailUrl: m.thumbnailUrl,
          renditions: [],
          status: 'INSPECTED',
          rightsStatus: 'UNKNOWN',
          tags: [],
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return mapRow(rows[0])
    },

    async list(query?: VideoLibraryListQuery) {
      if (!hasDatabaseUrl()) return { items: [], total: 0 }
      const db = getDb()
      const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100)
      const offset = Math.max(query?.offset ?? 0, 0)
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(videoLibraryItems)
      const rows = await db
        .select()
        .from(videoLibraryItems)
        .orderBy(desc(videoLibraryItems.createdAt))
        .limit(limit)
        .offset(offset)
      return { items: rows.map(mapRow), total: countRow?.count ?? 0 }
    },
  }
}

export const videoLibraryRepository = createDrizzleVideoLibraryRepository()
