/**
 * Cycle resume cursor for occurrence cron.
 * Controls WHERE execution resumes. Never whether an event exists/is cancelled/deleted.
 */

export const EVENT_SYNC_CHECKPOINT_FIELD = 'occurrenceCursor'

export interface ProviderCursor {
  nextIndex: number
  completed: boolean
  detailsUsed?: number
  batchIndex: number
}

export interface OccurrenceCheckpoint {
  cycleId: string
  startedAt: string
  lastCompletedAt: string | null
  health: 'running' | 'complete'
  biletix: ProviderCursor
  bubilet: ProviderCursor
  biletimgo: ProviderCursor
}

export interface OccurrenceCheckpointStore {
  load(): Promise<OccurrenceCheckpoint | null>
  save(checkpoint: OccurrenceCheckpoint): Promise<void>
}

export function emptyProviderCursor(): ProviderCursor {
  return { nextIndex: 0, completed: false, batchIndex: 0, detailsUsed: 0 }
}

export function istanbulCycleId(nowIso: string): string {
  const date = new Date(nowIso)
  const istanbul = new Date(date.getTime() + 3 * 60 * 60 * 1000)
  return istanbul.toISOString().slice(0, 10)
}

export function newOccurrenceCycle(nowIso: string): OccurrenceCheckpoint {
  return {
    cycleId: istanbulCycleId(nowIso),
    startedAt: nowIso,
    lastCompletedAt: null,
    health: 'running',
    biletix: emptyProviderCursor(),
    bubilet: emptyProviderCursor(),
    biletimgo: emptyProviderCursor(),
  }
}

export function isCheckpointUsable(
  checkpoint: OccurrenceCheckpoint | null | undefined,
  nowIso: string
): checkpoint is OccurrenceCheckpoint {
  if (!checkpoint) return false
  if (!checkpoint.cycleId || !checkpoint.biletix || !checkpoint.bubilet || !checkpoint.biletimgo) {
    return false
  }
  if (checkpoint.cycleId !== istanbulCycleId(nowIso)) return false
  return true
}

export function cycleComplete(checkpoint: OccurrenceCheckpoint): boolean {
  return (
    checkpoint.biletix.completed &&
    checkpoint.bubilet.completed &&
    checkpoint.biletimgo.completed
  )
}

export function markCycleComplete(
  checkpoint: OccurrenceCheckpoint,
  nowIso: string
): OccurrenceCheckpoint {
  return {
    ...checkpoint,
    health: 'complete',
    lastCompletedAt: nowIso,
    biletix: { ...checkpoint.biletix, completed: true },
    bubilet: { ...checkpoint.bubilet, completed: true },
    biletimgo: { ...checkpoint.biletimgo, completed: true },
  }
}

/** Advance only after a bounded unit succeeded. Premature advance is forbidden. */
export function advanceProviderCursor(
  cursor: ProviderCursor,
  input: { nextIndex: number; completed: boolean; detailsUsed?: number }
): ProviderCursor {
  return {
    nextIndex: input.nextIndex,
    completed: input.completed,
    batchIndex: cursor.batchIndex + 1,
    detailsUsed: input.detailsUsed ?? cursor.detailsUsed ?? 0,
  }
}

export function createMemoryCheckpointStore(
  initial: OccurrenceCheckpoint | null = null
): OccurrenceCheckpointStore & { snapshot(): OccurrenceCheckpoint | null } {
  let current = initial
  return {
    async load() {
      return current
    },
    async save(checkpoint) {
      current = structuredClone(checkpoint)
    },
    snapshot() {
      return current
    },
  }
}

/** Persists only occurrenceCursor on existing meta/eventSync. Not event authority. */
export function createMetaEventSyncCheckpointStore(
  db: Pick<import('firebase-admin/firestore').Firestore, 'doc'>
): OccurrenceCheckpointStore {
  return {
    async load() {
      const snap = await db.doc('meta/eventSync').get()
      const raw = snap.data()?.[EVENT_SYNC_CHECKPOINT_FIELD]
      return raw && typeof raw === 'object' ? (raw as OccurrenceCheckpoint) : null
    },
    async save(checkpoint) {
      await db.doc('meta/eventSync').set({ [EVENT_SYNC_CHECKPOINT_FIELD]: checkpoint }, { merge: true })
    },
  }
}

export function createFileCheckpointStore(filePath: string): OccurrenceCheckpointStore {
  return {
    async load() {
      const { readFile } = await import('node:fs/promises')
      try {
        const raw = await readFile(filePath, 'utf8')
        return JSON.parse(raw) as OccurrenceCheckpoint
      } catch {
        return null
      }
    },
    async save(checkpoint) {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(filePath, JSON.stringify(checkpoint, null, 2))
    },
  }
}

/**
 * Checkpoint never decides event existence. Missing/corrupt cursor → restart cycle.
 * Event rows stay untouched.
 */
export function resolveCheckpointOrRestart(
  stored: OccurrenceCheckpoint | null | undefined,
  nowIso: string
): { checkpoint: OccurrenceCheckpoint; restarted: boolean; reason: string | null } {
  if (!stored) {
    return { checkpoint: newOccurrenceCycle(nowIso), restarted: true, reason: 'missing' }
  }
  if (!isCheckpointUsable(stored, nowIso)) {
    return { checkpoint: newOccurrenceCycle(nowIso), restarted: true, reason: 'unusable' }
  }
  return { checkpoint: stored, restarted: false, reason: null }
}
