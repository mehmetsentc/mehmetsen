import 'server-only'

import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isNfRankLiveEnabled } from '@/lib/feed/featureFlag'
import {
  FEED_ALGORITHM_OPS_CACHE_MS,
  FEED_ALGORITHM_OPS_DOC_ID,
  defaultFeedAlgorithmOps,
  sanitizeFeedAlgorithmOps,
  type FeedAlgorithmOps,
} from '@/lib/feed/feedAlgorithmOps'

type CacheEntry = { at: number; ops: FeedAlgorithmOps; persisted: boolean }

let cache: CacheEntry | null = null

function docRef() {
  return getAdminFirestore().collection(Collections.FEED_ALGORITHM_OPS).doc(FEED_ALGORITHM_OPS_DOC_ID)
}

function envFallback(): FeedAlgorithmOps {
  return defaultFeedAlgorithmOps(isNfRankLiveEnabled())
}

export function invalidateFeedAlgorithmOpsCache(): void {
  cache = null
}

async function readFeedAlgorithmOps(): Promise<{ ops: FeedAlgorithmOps; persisted: boolean }> {
  try {
    const snap = await docRef().get()
    if (!snap.exists) return { ops: envFallback(), persisted: false }
    return {
      ops: sanitizeFeedAlgorithmOps(snap.data() as Partial<FeedAlgorithmOps>, isNfRankLiveEnabled()),
      persisted: true,
    }
  } catch {
    return { ops: envFallback(), persisted: false }
  }
}

export async function getFeedAlgorithmOps(): Promise<FeedAlgorithmOps> {
  const now = Date.now()
  if (cache && now - cache.at < FEED_ALGORITHM_OPS_CACHE_MS) return cache.ops
  const next = await readFeedAlgorithmOps()
  cache = { at: now, ops: next.ops, persisted: next.persisted }
  return next.ops
}

export async function getFeedAlgorithmOpsAdmin(): Promise<{
  ops: FeedAlgorithmOps
  persisted: boolean
  envLive: boolean
}> {
  const envLive = isNfRankLiveEnabled()
  const next = await readFeedAlgorithmOps()
  cache = { at: Date.now(), ops: next.ops, persisted: next.persisted }
  return { ...next, envLive }
}

export async function saveFeedAlgorithmOps(
  patch: Partial<FeedAlgorithmOps>,
  updatedBy: string | null
): Promise<FeedAlgorithmOps> {
  const current = await readFeedAlgorithmOps()
  const next = sanitizeFeedAlgorithmOps(
    {
      ...current.ops,
      ...patch,
      updatedAt: Date.now(),
      updatedBy,
    },
    isNfRankLiveEnabled()
  )
  await docRef().set(next, { merge: true })
  cache = { at: Date.now(), ops: next, persisted: true }
  return next
}
