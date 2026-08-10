/**
 * Queue freshness gates — keep publish/approval near source time.
 * Tunable via env; defaults allow backlog to drain before skipping.
 *
 * IMPORTANT: If the cron stops running, items must NOT become permanently
 * unreachable. Queue age (how long the item sat waiting) uses a generous
 * 48h default. Source age (how old the original article is) stays at 24h.
 */

const HOUR = 60 * 60 * 1000

/** Default RSS accept window when a worker does not set maxAgeMs. */
export const DEFAULT_RSS_MAX_AGE_MS = Number(
  process.env.NEWSROOM_DEFAULT_RSS_MAX_AGE_MS ?? 24 * HOUR
)

/** Skip at process time if sourcePublishedAt is older than this. */
export const MAX_SOURCE_AGE_MS = Number(
  process.env.NEWSROOM_QUEUE_MAX_SOURCE_AGE_MS ?? 24 * HOUR
)

/** Skip/purge if the queue row itself is older than this. Default 24h (override via env). */
export const MAX_QUEUE_AGE_MS = Number(
  process.env.NEWSROOM_QUEUE_MAX_PENDING_AGE_MS ?? 24 * HOUR
)

/** Tighter window for breaking / gundem. */
export const FAST_LANE_SOURCE_AGE_MS = Number(
  process.env.NEWSROOM_FAST_LANE_SOURCE_AGE_MS ?? 4 * HOUR
)

export const FAST_LANE_WORKER_IDS = new Set([
  'breaking-news',
  'gundem',
  'anka-breaking',
])

export function sourceAgeLimitMs(workerId: string): number {
  return FAST_LANE_WORKER_IDS.has(workerId) ? FAST_LANE_SOURCE_AGE_MS : MAX_SOURCE_AGE_MS
}

/**
 * Returns a skip reason if the job is too old to process, else null.
 */
export function staleQueueReason(job: {
  workerId: string
  createdAt?: number | null
  input?: { sourcePublishedAt?: number | null }
}): string | null {
  const now = Date.now()
  const createdAt = job.createdAt ?? 0
  if (createdAt > 0 && now - createdAt > MAX_QUEUE_AGE_MS) {
    return `stale_queue_age>${Math.round(MAX_QUEUE_AGE_MS / HOUR)}h`
  }

  const src = job.input?.sourcePublishedAt
  if (typeof src === 'number' && src > 0) {
    const limit = sourceAgeLimitMs(job.workerId)
    if (now - src > limit) {
      return `stale_source>${Math.round(limit / HOUR)}h`
    }
  }

  return null
}
