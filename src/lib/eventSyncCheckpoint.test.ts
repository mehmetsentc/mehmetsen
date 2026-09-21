import { describe, expect, it } from 'vitest'
import {
  advanceProviderCursor,
  createMemoryCheckpointStore,
  cycleComplete,
  emptyProviderCursor,
  istanbulCycleId,
  isCheckpointUsable,
  markCycleComplete,
  newOccurrenceCycle,
  resolveCheckpointOrRestart,
} from './eventSyncCheckpoint'

describe('occurrence checkpoint', () => {
  it('is only a resume cursor and never event authority', () => {
    const missing = resolveCheckpointOrRestart(null, '2026-09-21T21:00:00.000Z')
    expect(missing.restarted).toBe(true)
    expect(missing.reason).toBe('missing')
    expect(missing.checkpoint.biletix.nextIndex).toBe(0)
    expect(missing.checkpoint.health).toBe('running')
  })

  it('restarts on corrupt or stale cycle instead of deleting events', () => {
    const corrupt = resolveCheckpointOrRestart(
      { cycleId: '' } as never,
      '2026-09-21T21:00:00.000Z'
    )
    expect(corrupt.restarted).toBe(true)
    const stale = resolveCheckpointOrRestart(
      newOccurrenceCycle('2026-09-20T21:00:00.000Z'),
      '2026-09-21T21:00:00.000Z'
    )
    expect(stale.restarted).toBe(true)
    expect(stale.checkpoint.cycleId).toBe(istanbulCycleId('2026-09-21T21:00:00.000Z'))
  })

  it('advances only after a successful bounded unit', () => {
    const before = emptyProviderCursor()
    const failed = before
    expect(failed.nextIndex).toBe(0)
    const after = advanceProviderCursor(before, { nextIndex: 1, completed: false })
    expect(after.nextIndex).toBe(1)
    expect(after.batchIndex).toBe(1)
    expect(before.nextIndex).toBe(0)
  })

  it('repeats work if upsert happened but checkpoint was not saved', async () => {
    const store = createMemoryCheckpointStore()
    const started = newOccurrenceCycle('2026-09-21T21:00:00.000Z')
    await store.save(started)
    const upsertedButNotAdvanced = await store.load()
    expect(upsertedButNotAdvanced?.biletix.nextIndex).toBe(0)
  })

  it('completes a cycle and starts a new one the next Istanbul day', () => {
    const running = newOccurrenceCycle('2026-09-21T21:00:00.000Z')
    const done = markCycleComplete(
      {
        ...running,
        biletix: { ...running.biletix, completed: true },
        bubilet: { ...running.bubilet, completed: true },
        biletimgo: { ...running.biletimgo, completed: true },
      },
      '2026-09-21T22:00:00.000Z'
    )
    expect(cycleComplete(done)).toBe(true)
    expect(isCheckpointUsable(done, '2026-09-21T22:00:00.000Z')).toBe(true)
    expect(resolveCheckpointOrRestart(done, '2026-09-21T22:00:00.000Z').restarted).toBe(false)
    const next = resolveCheckpointOrRestart(done, '2026-09-22T21:00:00.000Z')
    expect(next.restarted).toBe(true)
    expect(next.checkpoint.cycleId).toBe('2026-09-23')
    expect(next.checkpoint.biletix.nextIndex).toBe(0)
  })

  it('does not share identity with the WRITE lock document', () => {
    expect(newOccurrenceCycle('2026-09-21T21:00:00.000Z').cycleId).not.toContain('eventSyncLock')
  })
})
