/**
 * SMM queue — schedule social posts without blocking HTTP publish path.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export type SmmQueueItem = {
  id: string
  newsId?: string | null
  citySlug?: string | null
  platform?: string | null
  status: 'queued' | 'processing' | 'published' | 'failed' | 'dead'
  priority?: string
  errorMessage?: string | null
  scheduledAt?: number | null
  createdAt: number
  updatedAt: number
  payload?: Record<string, unknown>
}

function col() {
  return getAdminFirestore().collection(Collections.SMM_QUEUE)
}

export async function listSmmQueue(limit = 80): Promise<SmmQueueItem[]> {
  const snap = await col().limit(Math.min(limit, 150)).get()
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SmmQueueItem, 'id'>) }))
  rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return rows
}

export async function enqueueSmmItem(input: {
  newsId?: string | null
  citySlug?: string | null
  platform?: string
  priority?: string
  payload?: Record<string, unknown>
  scheduledAt?: number | null
}): Promise<SmmQueueItem> {
  const now = Date.now()
  const ref = col().doc()
  const row: SmmQueueItem = {
    id: ref.id,
    newsId: input.newsId ?? null,
    citySlug: input.citySlug ?? null,
    platform: input.platform ?? 'facebook',
    status: 'queued',
    priority: input.priority ?? 'normal',
    errorMessage: null,
    scheduledAt: input.scheduledAt ?? now,
    createdAt: now,
    updatedAt: now,
    payload: input.payload ?? {},
  }
  await ref.set(row)
  return row
}
