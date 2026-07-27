/**
 * Process pending newsQueue items — pipeline → auto-publish with retries.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { linkFingerprintToNews } from '@/services/newsroom/detection/sourceFingerprint'
import {
  claimPendingQueueItems,
  markQueueFailed,
  markQueuePublished,
  markQueueSkipped,
  releaseQueueClaim,
} from '@/services/newsroom/queue/newsQueueService'
import type { QueueProcessStats } from '@/services/newsroom/queue/types'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'

const DEFAULT_BATCH_SIZE = Number(process.env.NEWSROOM_QUEUE_BATCH_SIZE ?? 12)

// Her job 3-4 AI çağrısı (stage1-3 + factChecker) × ~30s = yüksek CPU.
// 200s wall-clock budget: süre aşılırsa yeni job başlatma.
const WALL_CLOCK_BUDGET_MS = 200_000

export async function processNewsQueue(
  db: Firestore = getAdminFirestore(),
  batchSize = DEFAULT_BATCH_SIZE
): Promise<QueueProcessStats> {
  const startTime = Date.now()

  const stats: QueueProcessStats = {
    picked: 0,
    published: 0,
    updated: 0,
    drafted: 0,
    failed: 0,
    deadLetter: 0,
    skipped: 0,
    errors: [],
  }

  let batch: Awaited<ReturnType<typeof claimPendingQueueItems>>
  try {
    batch = await claimPendingQueueItems(db, batchSize)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[processNewsQueue] claimPendingQueueItems failed:', msg)
    stats.errors.push(`claimPendingQueueItems: ${msg}`)
    return stats
  }
  stats.picked = batch.length

  for (const job of batch) {
    if (Date.now() - startTime > WALL_CLOCK_BUDGET_MS) {
      console.warn(`[processNewsQueue] wall-clock budget (${WALL_CLOCK_BUDGET_MS / 1000}s) aşıldı, kalan job'lar sonraki çalışmaya bırakıldı`)
      // Release unprocessed claimed jobs so they are not stuck in processing
      const remaining = batch.slice(batch.indexOf(job))
      for (const leftover of remaining) {
        try {
          await releaseQueueClaim(db, leftover.id)
        } catch (err) {
          console.error(`[processNewsQueue] releaseQueueClaim failed for ${leftover.id}:`, err)
        }
      }
      break
    }
    const { data } = job

    try {
      const result = await processNewsroomArticle(db, data.input, {
        changeType: data.changeType,
        existingNewsId: data.existingNewsId ?? undefined,
        queueJobId: job.id,
      })

      if (result.outcome === 'published' || result.outcome === 'updated') {
        await markQueuePublished(db, job.id, result.newsId ?? '')
        if (result.newsId) {
          await linkFingerprintToNews(db, data.sourceId, data.fingerprintHash, result.newsId)
        }
        if (result.outcome === 'updated') stats.updated += 1
        else stats.published += 1
      } else if (result.outcome === 'created') {
        await markQueuePublished(db, job.id, result.newsId ?? 'draft')
        stats.drafted += 1
      } else if (result.outcome === 'skipped') {
        await markQueueSkipped(db, job.id, 'duplicate or unchanged')
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

  return stats
}
