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

const DAY_MS = 24 * 60 * 60 * 1000

/** Seed demo/shared memories so Hafıza is not empty after org setup. */
export async function seedDefaultMemories(verifiedBy?: string | null): Promise<{
  created: string[]
  skipped: string[]
}> {
  const created: string[] = []
  const skipped: string[] = []
  const now = Date.now()

  const samples: Array<{
    id: string
    scope: 'agent' | 'shared'
    agentId?: string | null
    type: EditorialMemoryRecord['type']
    content: string
    verified: boolean
    expiresAt: number | null
    confidence: number
  }> = [
    {
      id: 'mem-shared-no-sensational',
      scope: 'shared',
      type: 'editorialRule',
      content:
        'Kurumsal kural: Manşet ve sosyal caption’da “şok / dehşet / korkunç / kan donduran” yasak. İnsan editörler bu kalıpları düzenli siliyor.',
      verified: true,
      expiresAt: null,
      confidence: 0.95,
    },
    {
      id: 'mem-shared-source-attribution',
      scope: 'shared',
      type: 'editorialRule',
      content:
        'Kurumsal kural: Belediye / valilik duyurusunda kurum adı korunur; “kaynaklara göre” ile yumuşatma yapılmaz.',
      verified: true,
      expiresAt: null,
      confidence: 0.9,
    },
    {
      id: 'mem-shared-canakkale-smm',
      scope: 'shared',
      type: 'correction',
      content:
        'Çanakkale SMM: Production sosyal paylaşım hattı aktif (cron + /admin/social). Diğer iller ajan+talimat hazır; hesap bağlanınca cron enabledCitySlugs’a eklenir.',
      verified: true,
      expiresAt: now + 90 * DAY_MS,
      confidence: 0.85,
    },
    {
      id: 'mem-agent-fact-check-ttl',
      scope: 'agent',
      agentId: 'agent-fact-check',
      type: 'entity',
      content:
        'Geçici not (TTL): Fact-check ajanı doğrulanmamış sayısal iddiaları UNVERIFIED bırakır; kesin doğru demez.',
      verified: false,
      expiresAt: now + 14 * DAY_MS,
      confidence: 0.7,
    },
    {
      id: 'mem-agent-smm-canakkale',
      scope: 'agent',
      agentId: 'agent-smm-canakkale',
      type: 'style',
      content:
        'Çanakkale SMM tercihi: IG caption 120–400 karakter; FB açıklayıcı; X kısa. Troya/Boğaz abartılı turizm dili yok.',
      verified: true,
      expiresAt: now + 60 * DAY_MS,
      confidence: 0.88,
    },
  ]

  for (const sample of samples) {
    const ref = colFor(sample.scope).doc(sample.id)
    const snap = await ref.get()
    if (snap.exists) {
      skipped.push(sample.id)
      continue
    }
    const row: EditorialMemoryRecord = {
      id: sample.id,
      scope: sample.scope,
      agentId: sample.agentId ?? null,
      type: sample.type,
      content: sample.content,
      source: 'seed:default-memories',
      confidence: sample.confidence,
      verified: sample.verified,
      verifiedBy: sample.verified ? verifiedBy ?? 'system' : null,
      expiresAt: sample.expiresAt,
      createdAt: now,
      lastUsedAt: null,
    }
    await ref.set(row)
    created.push(sample.id)
  }

  return { created, skipped }
}

export async function deleteMemory(
  scope: 'agent' | 'shared',
  id: string
): Promise<boolean> {
  const ref = colFor(scope).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return false
  await ref.delete()
  return true
}
