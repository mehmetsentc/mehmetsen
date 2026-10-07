/**
 * Phase 2 — server-side editorial lists for scoped (il/ilçe/kategori) editors.
 * Scoped staff have no client Firestore access to drafts/queue (firestore.rules),
 * so the admin UI reads their slice through these Admin SDK helpers. Every row is
 * re-checked with canAccessContentScope before it leaves the server.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  canAccessContentScope,
  contentScopeOf,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'

export type ScopedNewsView = 'all' | 'published' | 'draft' | 'pending' | 'removed'
export const SCOPED_NEWS_VIEWS: readonly ScopedNewsView[] = ['all', 'published', 'draft', 'pending', 'removed']

export interface ScopedAdminDoc {
  id: string
  source: 'news' | 'newsDrafts'
  data: Record<string, unknown>
}

const SCAN_LIMIT = 300
const PAGE_LIMIT = 50

/** Firestore Timestamps → epoch ms so the client mappers read them as numbers. */
export function serializeDocForClient(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
      out[k] = (v as { toMillis: () => number }).toMillis()
    } else {
      out[k] = v
    }
  }
  return out
}

function createdMs(d: Record<string, unknown>): number {
  for (const key of ['createdAt', 'updatedAt', 'publishedAt']) {
    const v = d[key]
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
    if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
      return (v as { toMillis: () => number }).toMillis()
    }
  }
  return 0
}

function scopedProvince(scope: StaffScopeState): string | null {
  return scope.kind === 'scoped' && scope.scope.provinceSlugs.length === 1 ? scope.scope.provinceSlugs[0]! : null
}

type Snap = { docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }> }

/** Ordered query when the composite index exists; equality-only fallback otherwise. */
async function tryQueries(attempts: Array<() => Promise<Snap>>): Promise<Snap> {
  let lastErr: unknown = null
  for (const run of attempts) {
    try {
      return await run()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/**
 * One page of the scoped editor's slice, newest first.
 * `before` = createdAt cursor (ms) from the previous page.
 */
export async function listScopedAdminNews(
  scope: StaffScopeState,
  view: ScopedNewsView,
  before?: number | null
): Promise<{ items: ScopedAdminDoc[]; nextBefore: number | null }> {
  const province = scopedProvince(scope)
  if (!province) return { items: [], nextBefore: null }
  const db = getAdminFirestore()
  const rows: ScopedAdminDoc[] = []

  if (view === 'pending') {
    const drafts = await tryQueries([
      () => db.collection(Collections.NEWS_DRAFTS).where('draftStatus', '==', 'pending_review').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get(),
      () => db.collection(Collections.NEWS_DRAFTS).where('draftStatus', '==', 'pending_review').limit(SCAN_LIMIT).get(),
    ])
    for (const d of drafts.docs) rows.push({ id: d.id, source: 'newsDrafts', data: d.data() ?? {} })
    const legacy = await tryQueries([
      () => db.collection(Collections.NEWS).where('citySlug', '==', province).where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(SCAN_LIMIT).get(),
      () => db.collection(Collections.NEWS).where('citySlug', '==', province).where('status', '==', 'pending').limit(SCAN_LIMIT).get(),
    ])
    for (const d of legacy.docs) rows.push({ id: d.id, source: 'news', data: d.data() ?? {} })
  } else {
    const statuses = view === 'published' ? ['published'] : view === 'draft' ? ['draft'] : view === 'removed' ? ['archived', 'banned'] : null
    const base = () => {
      let q = db.collection(Collections.NEWS).where('citySlug', '==', province)
      if (statuses) q = q.where('status', 'in', statuses)
      return q
    }
    const snap = await tryQueries([
      () => {
        let q = base().orderBy('createdAt', 'desc')
        if (before) q = q.startAfter(before)
        return q.limit(SCAN_LIMIT).get()
      },
      () => base().limit(SCAN_LIMIT * 2).get(),
    ])
    for (const d of snap.docs) rows.push({ id: d.id, source: 'news', data: d.data() ?? {} })
  }

  const inScope = rows
    .filter((r) => canAccessContentScope(scope, contentScopeOf(r.data)))
    .filter((r) => r.data.isDuplicate !== true && r.data.categoryId !== 'tekrarlayan')
    .filter((r) => !before || createdMs(r.data) < before)
    .sort((a, b) => createdMs(b.data) - createdMs(a.data))
  const page = inScope.slice(0, PAGE_LIMIT)
  const last = page[page.length - 1]
  return {
    items: page.map((r) => ({ ...r, data: serializeDocForClient(r.data) })),
    nextBefore: inScope.length > PAGE_LIMIT && last ? createdMs(last.data) : null,
  }
}

/** Single news/draft document for the editor screen, scope-checked. */
export async function getScopedAdminDoc(
  scope: StaffScopeState,
  id: string
): Promise<{ status: 200; doc: ScopedAdminDoc } | { status: 403 | 404 }> {
  const db = getAdminFirestore()
  for (const source of ['news', 'newsDrafts'] as const) {
    const snap = await db.collection(source === 'news' ? Collections.NEWS : Collections.NEWS_DRAFTS).doc(id).get()
    if (!snap.exists) continue
    const data = (snap.data() ?? {}) as Record<string, unknown>
    if (!canAccessContentScope(scope, contentScopeOf(data))) return { status: 403 }
    return { status: 200, doc: { id, source, data: serializeDocForClient(data) } }
  }
  return { status: 404 }
}
