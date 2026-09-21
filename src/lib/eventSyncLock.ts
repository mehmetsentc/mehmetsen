/**
 * Smallest overlapping-run guard for /api/events/sync.
 * In-process lock always. Firestore lock is WRITE-only (shadow stays mutation-free).
 */

export const EVENT_SYNC_LOCK_DOC = 'meta/eventSyncLock'
export const EVENT_SYNC_LOCK_STALE_MS = 6 * 60 * 1000

export interface EventSyncLockRecord {
  runId: string
  mode: 'shadow' | 'write' | 'legacy'
  startedAt: string
}

export interface EventSyncLockStore {
  read(): Promise<EventSyncLockRecord | null>
  write(record: EventSyncLockRecord): Promise<void>
  clear(runId: string): Promise<void>
}

let processInFlight: Promise<unknown> | null = null

export function isEventSyncProcessLocked(): boolean {
  return processInFlight !== null
}

export function runWithEventSyncProcessLock<T>(fn: () => Promise<T>): Promise<T> {
  if (processInFlight) return processInFlight as Promise<T>
  const pending = fn().finally(() => {
    if (processInFlight === pending) processInFlight = null
  })
  processInFlight = pending
  return pending as Promise<T>
}

export function resetEventSyncProcessLockForTests() {
  processInFlight = null
}

export async function acquireEventSyncWriteLock(
  store: EventSyncLockStore,
  record: EventSyncLockRecord,
  nowMs = Date.now()
): Promise<{ acquired: true } | { acquired: false; reason: 'remote_active' }> {
  const existing = await store.read()
  if (existing) {
    const started = Date.parse(existing.startedAt)
    const stale = Number.isNaN(started) || nowMs - started > EVENT_SYNC_LOCK_STALE_MS
    if (!stale) return { acquired: false, reason: 'remote_active' }
  }
  await store.write(record)
  return { acquired: true }
}

export async function releaseEventSyncWriteLock(store: EventSyncLockStore, runId: string): Promise<void> {
  await store.clear(runId)
}

export async function withEventSyncWriteLock<T>(
  store: EventSyncLockStore,
  record: EventSyncLockRecord,
  fn: () => Promise<T>,
  nowMs = Date.now()
): Promise<{ ok: true; value: T } | { ok: false; reason: 'remote_active' }> {
  const acquired = await acquireEventSyncWriteLock(store, record, nowMs)
  if (!acquired.acquired) return { ok: false, reason: acquired.reason }
  try {
    const value = await fn()
    return { ok: true, value }
  } finally {
    await releaseEventSyncWriteLock(store, record.runId)
  }
}

export function createFirestoreEventSyncLockStore(db: {
  doc: (path: string) => {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>
    set(data: EventSyncLockRecord, options?: { merge: boolean }): Promise<unknown>
    delete(): Promise<unknown>
  }
}): EventSyncLockStore {
  const ref = db.doc(EVENT_SYNC_LOCK_DOC)
  return {
    async read() {
      const snap = await ref.get()
      if (!snap.exists) return null
      const data = snap.data() as EventSyncLockRecord | undefined
      if (!data?.runId || !data.startedAt) return null
      return { runId: data.runId, mode: data.mode, startedAt: data.startedAt }
    },
    async write(record) {
      await ref.set(record, { merge: false })
    },
    async clear(runId) {
      const snap = await ref.get()
      if ((snap.data() as EventSyncLockRecord | undefined)?.runId === runId) {
        await ref.delete()
      }
    },
  }
}
