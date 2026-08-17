/**
 * Process pending newsQueue items — pipeline → publish, skip junk, or newsDrafts.
 * Confident AI publish → live + needsReview (CMS İnceleme).
 * Thin / duplicate / incomplete → skipped (queue stays empty).
 * Hold / moderation / DRAFT_ONLY persona → newsDrafts pending_review.
 * Kill switch: NEWSROOM_AUTO_PUBLISH_ENABLED=0 → remaining items → drafts.
 *
 * Claim order: newest-first (createdAt DESC / LIFO) — see claimPendingQueueItems.
 * Cron + CMS "Kuyruğu hızlı işle" share this path; batch/concurrency unchanged.
 *
 * Throughput tuning (env vars — override for emergency speed-up):
 *   NEWSROOM_QUEUE_BATCH_SIZE — items claimed per run (default 30)
 *   NEWSROOM_QUEUE_CONCURRENCY — parallel pipeline jobs (default 6)
 *   NEWSROOM_QUEUE_BUDGET_MS  — wall-clock budget in ms (default 250000)
 *
 * Cron schedule: every 2 min in vercel.json; ingest crons also drain via `after()`.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { linkFingerprintToNews } from '@/services/newsroom/detection/sourceFingerprint'
import { detectQueueDuplicate } from '@/services/newsroom/queue/queueDuplicateCheck'
import {
  claimPendingQueueItems,
  markQueueDuplicate,
  markQueueFailed,
  markQueuePublished,
  markQueueSkipped,
  releaseQueueClaim,
} from '@/services/newsroom/queue/newsQueueService'
import { recordStoryInLibrary } from '@/services/newsroom/dedupe/storyLibraryService'
import { staleQueueReason } from '@/services/newsroom/queue/freshness'
import type { QueueProcessStats } from '@/services/newsroom/queue/types'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { NEWSROOM_AUTO_PUBLISH_ENABLED } from '@/services/newsroom/config'

const DEFAULT_BATCH_SIZE = Number(process.env.NEWSROOM_QUEUE_BATCH_SIZE ?? 30)
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.NEWSROOM_QUEUE_CONCURRENCY ?? 6)))
const WALL_CLOCK_BUDGET_MS = Number(process.env.NEWSROOM_QUEUE_BUDGET_MS ?? 250_000)

export interface ProcessQueueOptions {
  skipFreshnessCheck?: boolean
  /** Only claim queue rows created at/after this timestamp (newest-first still). */
  minCreatedAt?: number
}

export async function processNewsQueue(
  db: Firestore = getAdminFirestore(),
  batchSize = DEFAULT_BATCH_SIZE,
  options: ProcessQueueOptions = {}
): Promise<QueueProcessStats> {
  const startTime = Date.now()

  if (!NEWSROOM_AUTO_PUBLISH_ENABLED) {
    console.log('[processNewsQueue] auto-publish OFF — processed items → newsDrafts (Onay Bekliyor)')
  } else {
    console.log('[processNewsQueue] auto-publish ON — confident AI publish → live + İnceleme; hold → Onay Bekliyor')
  }

  const stats: QueueProcessStats = {
    picked: 0,
    published: 0,
    updated: 0,
    drafted: 0,
    failed: 0,
    deadLetter: 0,
    skipped: 0,
    duplicateLibraryHits: 0,
    errors: [],
  }

  let batch: Awaited<ReturnType<typeof claimPendingQueueItems>>
  try {
    batch = await claimPendingQueueItems(db, batchSize, {
      minCreatedAt: options.minCreatedAt,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[processNewsQueue] claimPendingQueueItems failed:', msg)
    stats.errors.push(`claimPendingQueueItems: ${msg}`)
    return stats
  }
  stats.picked = batch.length
  if (batch.length === 0) return stats

  let budgetExceeded = false

  async function processJob(job: (typeof batch)[number]): Promise<void> {
    if (budgetExceeded) {
      try { await releaseQueueClaim(db, job.id) } catch { /* ignore */ }
      return
    }
    if (Date.now() - startTime > WALL_CLOCK_BUDGET_MS) {
      budgetExceeded = true
      console.warn(`[processNewsQueue] wall-clock budget (${WALL_CLOCK_BUDGET_MS / 1000}s) aşıldı`)
      try { await releaseQueueClaim(db, job.id) } catch { /* ignore */ }
      return
    }

    const { data } = job

    try {
      if (!options.skipFreshnessCheck) {
        const staleReason = staleQueueReason(data)
        if (staleReason) {
          await markQueueSkipped(db, job.id, staleReason)
          stats.skipped += 1
          return
        }
      }

      const duplicateHit = await detectQueueDuplicate(db, data, { queueId: job.id })
      if (duplicateHit) {
        console.log(
          `[processNewsQueue] duplicate skip ${job.id}` +
            (duplicateHit.existingNewsId ? ` → ${duplicateHit.existingNewsId}` : '') +
            (duplicateHit.peerQueueId ? ` peer→${duplicateHit.peerQueueId}` : '') +
            (duplicateHit.libraryHit ? ` [library:${duplicateHit.matchMethod}]` : '')
        )

        // Intra-queue: drop weaker peer, keep this job when we are the keeper
        if (duplicateHit.peerQueueId && duplicateHit.dropPeer && !duplicateHit.dropSelf) {
          try {
            await markQueueSkipped(
              db,
              duplicateHit.peerQueueId,
              `queuePeerDuplicate:weaker:${(duplicateHit.similarity ?? 0).toFixed(2)}`
            )
          } catch (err) {
            console.warn(`[processNewsQueue] drop peer ${duplicateHit.peerQueueId} failed:`, err)
          }
          // Continue processing the stronger item — do not skip this job
        } else if (duplicateHit.peerQueueId && duplicateHit.needsReview && !duplicateHit.dropSelf) {
          const mine = duplicateHit.qualityScore ?? 0
          const theirs = duplicateHit.peerQualityScore ?? 0
          if (mine <= theirs) {
            await markQueueSkipped(db, job.id, `${duplicateHit.reason}:duplicate_weaker`)
            stats.skipped += 1
            return
          }
          try {
            await markQueueSkipped(
              db,
              duplicateHit.peerQueueId,
              `queuePeerDuplicate:weaker:${(duplicateHit.similarity ?? 0).toFixed(2)}`
            )
          } catch {
            /* non-critical */
          }
        } else if (duplicateHit.peerQueueId && duplicateHit.dropSelf) {
          await markQueueSkipped(db, job.id, duplicateHit.reason)
          stats.skipped += 1
          return
        } else if (duplicateHit.libraryHit) {
          await markQueueDuplicate(db, job.id, duplicateHit, data.input)
          stats.duplicateLibraryHits += 1
          stats.skipped += 1
          return
        } else if (!duplicateHit.peerQueueId || duplicateHit.dropSelf !== false) {
          // Published / fingerprint / similar hit
          await markQueueSkipped(db, job.id, duplicateHit.reason)
          stats.skipped += 1
          return
        }
      }

      const result = await processNewsroomArticle(db, data.input, {
        changeType: data.changeType,
        existingNewsId: data.existingNewsId ?? undefined,
        queueJobId: job.id,
      })

      if (result.outcome === 'published' || result.outcome === 'updated') {
        await markQueuePublished(db, job.id, result.newsId ?? '')
        if (result.newsId) {
          await linkFingerprintToNews(db, data.sourceId, data.fingerprintHash, result.newsId)
          await recordStoryInLibrary(db, data.input, {
            newsId: result.newsId,
            title: data.input.originalTitle,
            citySlug: data.input.forcedCitySlug ?? null,
          })
        }
        if (result.outcome === 'updated') stats.updated += 1
        else stats.published += 1
      } else if (result.outcome === 'created') {
        await markQueuePublished(db, job.id, result.newsId ?? 'draft')
        if (result.newsId) {
          await recordStoryInLibrary(db, data.input, {
            newsId: result.newsId,
            title: data.input.originalTitle,
            citySlug: data.input.forcedCitySlug ?? null,
          })
        }
        stats.drafted += 1
      } else if (result.outcome === 'skipped') {
        await markQueueSkipped(
          db,
          job.id,
          result.skipReason?.trim() || 'duplicate or unchanged'
        )
        stats.skipped += 1
      } else {
        throw new Error('Pipeline returned failed outcome')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[processNewsQueue] job ${job.id} failed:`, message)
      stats.errors.push(`[${job.id}] ${message}`)
      try {
        await markQueueFailed(db, job.id, message, data.attempts, data.maxAttempts)
      } catch (markErr) {
        console.error(`[processNewsQueue] markQueueFailed also failed for ${job.id}:`, markErr)
      }
      if (data.attempts + 1 >= data.maxAttempts) stats.deadLetter += 1
      else stats.failed += 1
    }
  }

  // Process in parallel with bounded concurrency
  const queue = [...batch]
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0 && !budgetExceeded) {
          const job = queue.shift()
          if (!job) break
          await processJob(job)
        }
      })()
    )
  }
  await Promise.all(workers)

  // Release any remaining jobs that weren't processed due to budget
  if (budgetExceeded) {
    for (const job of queue) {
      try { await releaseQueueClaim(db, job.id) } catch { /* ignore */ }
    }
  }

  console.log(
    `[processNewsQueue] done: picked=${stats.picked} pub=${stats.published} draft=${stats.drafted}` +
      ` skip=${stats.skipped} libraryDup=${stats.duplicateLibraryHits} fail=${stats.failed}` +
      ` elapsed=${Date.now() - startTime}ms`
  )
  return stats
}
