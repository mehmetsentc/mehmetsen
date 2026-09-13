import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { videoLibraryItems, videoLibraryJobs } from '@/db/schema/videoLibrary'
import type { VideoLibraryItem, VideoLibraryStatus, VideoPlatform, VideoRightsStatus } from '@/video/domain/types'
import type { VideoImportJob, VideoImportJobKind, VideoImportJobStatus } from '@/video/storage/jobs'
import { newVideoLibraryId } from '@/video/domain/ids'
import type { VideoImportStore } from './types'

function mapItem(row: typeof videoLibraryItems.$inferSelect): VideoLibraryItem {
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
    playbackMimeType: row.playbackMimeType,
    playbackFileSizeBytes: row.playbackFileSizeBytes,
    videoCodec: row.videoCodec,
    audioCodec: row.audioCodec,
    fps: row.fps,
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
    processErrorCode: row.processErrorCode,
    processErrorMessage: row.processErrorMessage,
    lastProcessJobId: row.lastProcessJobId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapJob(row: typeof videoLibraryJobs.$inferSelect): VideoImportJob {
  return {
    id: row.id,
    itemId: row.itemId,
    kind: row.kind as VideoImportJobKind,
    status: row.status as VideoImportJobStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    errorCode: row.errorCode,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    claimedAt: row.claimedAt,
    claimedBy: row.claimedBy,
    leaseExpiresAt: row.leaseExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createDrizzleImportStore(): VideoImportStore {
  return {
    async findItemById(id) {
      if (!hasDatabaseUrl()) return null
      const rows = await getDb().select().from(videoLibraryItems).where(eq(videoLibraryItems.id, id)).limit(1)
      return rows[0] ? mapItem(rows[0]) : null
    },
    async findItemByContentHash(hash, exceptItemId) {
      if (!hasDatabaseUrl()) return null
      const rows = exceptItemId
        ? await getDb()
            .select()
            .from(videoLibraryItems)
            .where(and(eq(videoLibraryItems.contentHash, hash), ne(videoLibraryItems.id, exceptItemId)))
            .limit(1)
        : await getDb()
            .select()
            .from(videoLibraryItems)
            .where(eq(videoLibraryItems.contentHash, hash))
            .limit(1)
      return rows[0]?.originalStorageKey ? mapItem(rows[0]) : null
    },
    async findActiveDownloadJob(itemId) {
      return findActiveJobByKind(itemId, 'DOWNLOAD')
    },
    async findActiveProcessJob(itemId) {
      return findActiveJobByKind(itemId, 'PROCESS')
    },
    async insertJob(input) {
      if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
      const now = new Date()
      const rows = await getDb()
        .insert(videoLibraryJobs)
        .values({
          id: newVideoLibraryId('vlj'),
          itemId: input.itemId,
          kind: input.kind,
          status: 'QUEUED',
          attempts: 0,
          payload: input.payload,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return mapJob(rows[0])
    },
    async claimNextDownloadJob(input) {
      return claimNextJobByKind('DOWNLOAD', input)
    },
    async claimNextProcessJob(input) {
      return claimNextJobByKind('PROCESS', input)
    },
    async saveJob(job) {
      if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
      await getDb()
        .update(videoLibraryJobs)
        .set({
          status: job.status,
          attempts: job.attempts,
          lastError: job.lastError,
          errorCode: job.errorCode,
          payload: job.payload,
          claimedAt: job.claimedAt,
          claimedBy: job.claimedBy,
          leaseExpiresAt: job.leaseExpiresAt,
          updatedAt: job.updatedAt,
        })
        .where(eq(videoLibraryJobs.id, job.id))
    },
    async listJobs(limit = 100) {
      if (!hasDatabaseUrl()) return []
      const rows = await getDb()
        .select()
        .from(videoLibraryJobs)
        .orderBy(desc(videoLibraryJobs.createdAt))
        .limit(Math.min(Math.max(limit, 1), 200))
      return rows.map(mapJob)
    },
    async updateItem(id, patch) {
      if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
      const set: Record<string, unknown> = {
        updatedAt: patch.updatedAt ?? new Date(),
      }
      if (patch.status !== undefined) set.status = patch.status
      if (patch.originalStorageKey !== undefined) set.originalStorageKey = patch.originalStorageKey
      if (patch.mimeType !== undefined) set.mimeType = patch.mimeType
      if (patch.fileSizeBytes !== undefined) set.fileSizeBytes = patch.fileSizeBytes
      if (patch.contentHash !== undefined) set.contentHash = patch.contentHash
      if (patch.importedAt !== undefined) set.importedAt = patch.importedAt
      if (patch.importErrorCode !== undefined) set.importErrorCode = patch.importErrorCode
      if (patch.importErrorMessage !== undefined) set.importErrorMessage = patch.importErrorMessage
      if (patch.lastImportJobId !== undefined) set.lastImportJobId = patch.lastImportJobId
      if (patch.updatedBy !== undefined) set.updatedBy = patch.updatedBy
      if (patch.posterStorageKey !== undefined) set.posterStorageKey = patch.posterStorageKey
      if (patch.playbackStorageKey !== undefined) set.playbackStorageKey = patch.playbackStorageKey
      if (patch.playbackMimeType !== undefined) set.playbackMimeType = patch.playbackMimeType
      if (patch.playbackFileSizeBytes !== undefined) set.playbackFileSizeBytes = patch.playbackFileSizeBytes
      if (patch.videoCodec !== undefined) set.videoCodec = patch.videoCodec
      if (patch.audioCodec !== undefined) set.audioCodec = patch.audioCodec
      if (patch.fps !== undefined) set.fps = patch.fps
      if (patch.width !== undefined) set.width = patch.width
      if (patch.height !== undefined) set.height = patch.height
      if (patch.durationMs !== undefined) set.durationMs = patch.durationMs
      if (patch.aspectRatio !== undefined) set.aspectRatio = patch.aspectRatio
      if (patch.renditions !== undefined) set.renditions = patch.renditions
      if (patch.processErrorCode !== undefined) set.processErrorCode = patch.processErrorCode
      if (patch.processErrorMessage !== undefined) set.processErrorMessage = patch.processErrorMessage
      if (patch.lastProcessJobId !== undefined) set.lastProcessJobId = patch.lastProcessJobId
      const rows = await getDb()
        .update(videoLibraryItems)
        .set(set)
        .where(eq(videoLibraryItems.id, id))
        .returning()
      if (!rows[0]) throw new Error('NOT_FOUND')
      return mapItem(rows[0])
    },
  }
}

async function findActiveJobByKind(itemId: string, kind: VideoImportJobKind) {
  if (!hasDatabaseUrl()) return null
  const rows = await getDb()
    .select()
    .from(videoLibraryJobs)
    .where(
      and(
        eq(videoLibraryJobs.itemId, itemId),
        eq(videoLibraryJobs.kind, kind),
        inArray(videoLibraryJobs.status, ['QUEUED', 'RUNNING', 'PENDING'])
      )
    )
    .limit(1)
  return rows[0] ? mapJob(rows[0]) : null
}

async function claimNextJobByKind(
  kind: VideoImportJobKind,
  input: { workerId: string; now: Date; leaseMs: number }
) {
  if (!hasDatabaseUrl()) return null
  const db = getDb()
  const candidates = await db
    .select()
    .from(videoLibraryJobs)
    .where(
      and(
        eq(videoLibraryJobs.kind, kind),
        sql`(
          ${videoLibraryJobs.status} in ('QUEUED','PENDING')
          or (
            ${videoLibraryJobs.status} = 'RUNNING'
            and ${videoLibraryJobs.leaseExpiresAt} is not null
            and ${videoLibraryJobs.leaseExpiresAt} <= ${input.now}
          )
        )`
      )
    )
    .orderBy(asc(videoLibraryJobs.createdAt))
    .limit(8)

  for (const row of candidates) {
    const retryAfter = Number((row.payload as { retryAfter?: number } | null)?.retryAfter ?? 0)
    if (retryAfter && retryAfter > input.now.getTime()) continue
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs)
    const claimed = await db
      .update(videoLibraryJobs)
      .set({
        status: 'RUNNING',
        claimedAt: input.now,
        claimedBy: input.workerId,
        leaseExpiresAt,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(videoLibraryJobs.id, row.id),
          sql`(
            ${videoLibraryJobs.status} in ('QUEUED','PENDING')
            or (
              ${videoLibraryJobs.status} = 'RUNNING'
              and ${videoLibraryJobs.leaseExpiresAt} is not null
              and ${videoLibraryJobs.leaseExpiresAt} <= ${input.now}
            )
          )`
        )
      )
      .returning()
    if (claimed[0]) return mapJob(claimed[0])
  }
  return null
}

export const videoImportStore = createDrizzleImportStore()
