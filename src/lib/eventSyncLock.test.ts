import { describe, expect, it } from 'vitest'
import {
  acquireEventSyncWriteLock,
  EVENT_SYNC_LOCK_STALE_MS,
  isEventSyncProcessLocked,
  releaseEventSyncWriteLock,
  resetEventSyncProcessLockForTests,
  runWithEventSyncProcessLock,
  withEventSyncWriteLock,
  type EventSyncLockRecord,
  type EventSyncLockStore,
} from './eventSyncLock'

function memoryStore(initial: EventSyncLockRecord | null = null): EventSyncLockStore & { current: EventSyncLockRecord | null } {
  const store = {
    current: initial,
    async read() {
      return store.current
    },
    async write(record: EventSyncLockRecord) {
      store.current = record
    },
    async clear(runId: string) {
      if (store.current?.runId === runId) store.current = null
    },
  }
  return store
}

describe('eventSyncLock', () => {
  it('reuses the in-process lock so a second invocation joins the first', async () => {
    resetEventSyncProcessLockForTests()
    let started = 0
    const first = runWithEventSyncProcessLock(async () => {
      started += 1
      return 'a'
    })
    expect(isEventSyncProcessLocked()).toBe(true)
    const second = runWithEventSyncProcessLock(async () => {
      started += 1
      return 'b'
    })
    expect(await first).toBe('a')
    expect(await second).toBe('a')
    expect(started).toBe(1)
    resetEventSyncProcessLockForTests()
  })

  it('blocks a second WRITE lock while the first is fresh', async () => {
    const store = memoryStore({
      runId: 'one',
      mode: 'write',
      startedAt: new Date().toISOString(),
    })
    const again = await acquireEventSyncWriteLock(store, {
      runId: 'two',
      mode: 'write',
      startedAt: new Date().toISOString(),
    })
    expect(again.acquired).toBe(false)
  })

  it('replaces a stale WRITE lock and releases by runId', async () => {
    const store = memoryStore({
      runId: 'old',
      mode: 'write',
      startedAt: new Date(Date.now() - EVENT_SYNC_LOCK_STALE_MS - 1000).toISOString(),
    })
    const acquired = await acquireEventSyncWriteLock(store, {
      runId: 'new',
      mode: 'write',
      startedAt: new Date().toISOString(),
    })
    expect(acquired.acquired).toBe(true)
    await releaseEventSyncWriteLock(store, 'new')
    expect(store.current).toBeNull()
  })

  it('cannot steal a live WRITE lock and releases the lock after an exception', async () => {
    const live = memoryStore({
      runId: 'live',
      mode: 'write',
      startedAt: new Date().toISOString(),
    })
    const stolen = await acquireEventSyncWriteLock(live, {
      runId: 'thief',
      mode: 'write',
      startedAt: new Date().toISOString(),
    })
    expect(stolen.acquired).toBe(false)
    expect(live.current?.runId).toBe('live')

    const store = memoryStore()
    await expect(
      withEventSyncWriteLock(store, {
        runId: 'boom',
        mode: 'write',
        startedAt: new Date().toISOString(),
      }, async () => {
        throw new Error('write-failed')
      })
    ).rejects.toThrow('write-failed')
    expect(store.current).toBeNull()
  })
})
