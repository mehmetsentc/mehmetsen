/**
 * Editorial / agent memory — TTL aware, never treats temp news as eternal truth.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { EditorialMemoryRecord } from '@/types/newsroomOs'

function agentMemCol() {
  return getAdminFirestore().collection(Collections.AGENT_MEMORIES)
}
function sharedMemCol() {
  return getAdminFirestore().collection(Collections.SHARED_MEMORIES)
}

function colFor(scope: 'agent' | 'shared') {
  return scope === 'shared' ? sharedMemCol() : agentMemCol()
}

export async function listMemories(opts?: {
  scope?: 'agent' | 'shared'
  agentId?: string
  limit?: number
}): Promise<EditorialMemoryRecord[]> {
  const limit = Math.min(opts?.limit ?? 80, 150)
  const scopes: Array<'agent' | 'shared'> =
    opts?.scope === 'agent' ? ['agent'] : opts?.scope === 'shared' ? ['shared'] : ['agent', 'shared']

  const now = Date.now()
  const out: EditorialMemoryRecord[] = []
  for (const scope of scopes) {
    const snap = await colFor(scope).limit(limit).get()
    for (const d of snap.docs) {
      const row = { id: d.id, ...(d.data() as Omit<EditorialMemoryRecord, 'id'>) }
      if (row.expiresAt && row.expiresAt < now) continue
      if (opts?.agentId && row.agentId && row.agentId !== opts.agentId) continue
      out.push({ ...row, scope: row.scope ?? scope })
    }
  }
  out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return out.slice(0, limit)
}

export async function createMemory(input: {
  scope: 'agent' | 'shared'
  agentId?: string | null
  type: EditorialMemoryRecord['type']
  content: string
  source?: string | null
  confidence?: number
  verified?: boolean
  verifiedBy?: string | null
  expiresAt?: number | null
}): Promise<EditorialMemoryRecord> {
  const now = Date.now()
  const ref = colFor(input.scope).doc()
  const row: EditorialMemoryRecord = {
    id: ref.id,
    scope: input.scope,
    agentId: input.agentId ?? null,
    type: input.type,
    content: input.content.trim(),
    source: input.source ?? null,
    confidence: input.confidence ?? 0.7,
    verified: Boolean(input.verified),
    verifiedBy: input.verifiedBy ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    lastUsedAt: null,
  }
  await ref.set(row)
  return row
}
