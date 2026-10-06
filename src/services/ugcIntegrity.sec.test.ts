/**
 * SEC-UGC-INTEGRITY-REPAIR-1 — application-level UGC integrity.
 * Real routes + real newsDraftService over an in-memory Firestore fake.
 * Local fixtures only: no network, no production data, no AI calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldValue } from 'firebase-admin/firestore'

type Doc = Record<string, unknown>
const db = new Map<string, Map<string, Doc>>()
const tokens = new Map<string, { uid: string; email?: string }>()

function colMap(name: string) {
  if (!db.has(name)) db.set(name, new Map())
  return db.get(name)!
}
function applyPatch(prev: Doc, patch: Doc): Doc {
  const next: Doc = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof FieldValue && FieldValue.delete().isEqual(v)) delete next[k]
    else if (v instanceof FieldValue) next[k] = Date.now()
    else next[k] = v
  }
  return next
}
let autoId = 0
function docRef(name: string, id: string) {
  return {
    id,
    async get() {
      const d = colMap(name).get(id)
      return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) }
    },
    async set(data: Doc, opts?: { merge?: boolean }) {
      const prev = opts?.merge ? colMap(name).get(id) ?? {} : {}
      colMap(name).set(id, applyPatch(prev, data))
    },
    async update(patch: Doc) {
      const prev = colMap(name).get(id)
      if (!prev) throw new Error(`NOT_FOUND ${name}/${id}`)
      colMap(name).set(id, applyPatch(prev, patch))
    },
    async delete() { colMap(name).delete(id) },
  }
}
function query(name: string, filters: Array<[string, string, unknown]>, lim = 1000) {
  return {
    where: (f: string, op: string, v: unknown) => query(name, [...filters, [f, op, v]], lim),
    orderBy: () => query(name, filters, lim),
    limit: (n: number) => query(name, filters, n),
    async get() {
      const docs = [...colMap(name).entries()]
        .filter(([, d]) =>
          filters.every(([f, op, v]) =>
            op === '>=' ? Number(d[f]) >= Number(v) : op === 'in' ? (v as unknown[]).includes(d[f]) : d[f] === v
          )
        )
        .slice(0, lim)
        .map(([id, d]) => ({ id, ref: docRef(name, id), exists: true, data: () => structuredClone(d) }))
      return { empty: docs.length === 0, size: docs.length, docs }
    },
  }
}
function collection(name: string) {
  return {
    ...query(name, []),
    doc: (id?: string) => docRef(name, id ?? `auto_${++autoId}`),
    add: async (data: Doc) => { const r = docRef(name, `auto_${++autoId}`); await r.set(data); return r },
  }
}
const fakeFirestore = { collection, batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }) }

const { syncCrawlerEditorial, processNewsroomArticle } = vi.hoisted(() => ({
  syncCrawlerEditorial: vi.fn().mockResolvedValue(undefined),
  processNewsroomArticle: vi.fn().mockResolvedValue({ outcome: 'created' }),
}))

vi.mock('@/lib/firebase/admin', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fakeFirestore,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      const hit = tokens.get(t)
      if (!hit) throw new Error('bad token')
      return { uid: hit.uid, email: hit.email }
    },
  }),
}))
// bulk-approve imports Collections via the client SDK module; keep the client SDK out of tests
vi.mock('@/lib/firebase/firestore', async () => ({
  Collections: (await import('@/lib/firebase/collections')).Collections,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/revalidateHome', () => ({ revalidateHomeFeedCaches: vi.fn(), revalidatePublishedNews: vi.fn() }))
vi.mock('@/lib/indexNow', () => ({ notifyPublishedArticle: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/crawler/editorial/newsLink', () => ({ syncCrawlerEditorial }))
// flush-pending ingestion/queue side — never touched in tests (no RSS, no AI)
vi.mock('@/services/newsroom/workers/breakingWorker', () => ({ runBreakingWorker: vi.fn().mockResolvedValue({ itemsNew: 0 }) }))
vi.mock('@/services/newsroom/workers/gundemWorker', () => ({ runGundemWorker: vi.fn().mockResolvedValue({ itemsNew: 0 }) }))
vi.mock('@/services/newsroom/workers/ankaBreakingWorker', () => ({ runAnkaBreakingWorker: vi.fn().mockResolvedValue({ itemsNew: 0 }) }))
vi.mock('@/services/newsroom/queue/queueProcessor', () => ({
  processNewsQueue: vi.fn().mockResolvedValue({ picked: 0, published: 0, drafted: 0, skipped: 0, failed: 0 }),
}))
// draft-reprocess AI side — mocked; asserts UGC never reaches it
vi.mock('@/services/newsroom/pipeline', () => ({ processNewsroomArticle }))
vi.mock('@/lib/ai/editorial/aiEditorService', () => ({
  enableAutoPublishForActiveEditors: vi.fn().mockResolvedValue({ updated: [] }),
}))
vi.mock('@/services/newsroom/config', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  NEWSROOM_AUTO_PUBLISH_ENABLED: true,
}))

import { NextRequest } from 'next/server'
import {
  UGC_REQUIRES_INDIVIDUAL_REVIEW,
  buildUgcBylineFromUserDoc,
  crawlerRawArticleIdForPublication,
  isUgcDraft,
  normalizeUgcDraftForPublication,
  partitionBulkApprovalCandidates,
} from '@/lib/editorial/ugcPublicationBoundary'
import { newsDraftService } from '@/services/newsDraftService'
import { POST as bulkApprove } from '@/app/api/admin/news-drafts/bulk-approve/route'
import { POST as flushPending } from '@/app/api/admin/newsroom/flush-pending/route'
import { POST as approveOne } from '@/app/api/admin/news-drafts/[id]/approve/route'
import { POST as ugcSubmit } from '@/app/api/ugc/submit/route'
import { reprocessPendingDrafts } from '@/services/newsroom/draftReprocessService'

const BODY = Array.from({ length: 60 }, (_, i) => `kelime${i}`).join(' ')
const NOW = Date.now()

/** What an attacker could have stored through the old direct-browser rule. */
const ATTACKER_FIELDS = {
  featured: true,
  isEditorPick: true,
  featuredAt: 1,
  localFeatured: true,
  isBreaking: true,
  breakingScore: 100,
  priorityScore: 100,
  isPinned: true,
  isTrending: true,
  aiAutoPublished: true,
  author: 'NaHaber Editörü',
  authorUsername: 'kidemli-muhabir',
  authorDisplayName: 'Kıdemli Muhabir',
  authorPhotoURL: 'https://example.invalid/staff.png',
  aiEditorId: 'ai-editor-1',
  articleFormat: 'column',
  editorId: 'national-news',
  editorType: 'national',
  confidenceScore: 100,
  rssGuid: 'raw_victim123',
  rssFingerprint: 'fp',
  sourceUrl: 'https://example.invalid/a',
  ingestionSourceId: 'src-aa',
  sourceLabel: 'AA',
  rightsStatus: 'licensed',
  rightsBasis: 'contract',
  originalContent: 'x',
}

function ugcDraft(extra: Doc = {}): Doc {
  return {
    title: 'Okur haberi başlık',
    description: BODY,
    summary: BODY.slice(0, 100),
    authorId: 'u-reader',
    source: 'ugc',
    type: 'ugc',
    draftStatus: 'pending_review',
    categoryId: 'gundem',
    category: 'gundem',
    createdAt: NOW,
    ...extra,
  }
}
function aiDraft(extra: Doc = {}): Doc {
  return {
    title: 'AI taslak başlık',
    description: BODY,
    author: 'AI',
    authorId: 'ai',
    source: 'AA',
    sourceLabel: 'AA',
    draftStatus: 'pending_review',
    categoryId: 'gundem',
    category: 'gundem',
    createdAt: NOW,
    confidenceScore: 90,
    rssGuid: 'raw_ai1',
    ...extra,
  }
}

function seed() {
  db.clear()
  tokens.clear()
  autoId = 0
  syncCrawlerEditorial.mockClear()
  processNewsroomArticle.mockClear()
  tokens.set('t-me', { uid: 'u-me', email: 'me@example.test' })
  tokens.set('t-reader', { uid: 'u-reader', email: 'reader@example.test' })
  tokens.set('t-scoped', { uid: 'u-scoped', email: 'scoped@example.test' })
  const users = colMap('users')
  users.set('u-me', { role: 'managing_editor' })
  users.set('u-reader', { role: 'user', username: 'okur_ali', displayName: 'Ali Okur' })
  users.set('u-scoped', { role: 'managing_editor', cmsScope: { provinceSlugs: ['canakkale'] } })
}
const req = (url: string, token: string | null, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const news = () => [...colMap('news').values()]
const drafts = () => colMap('newsDrafts')

beforeEach(() => {
  seed()
  vi.stubEnv('SUPER_ADMIN_EMAIL', 'nobody-super@example.test')
  vi.stubEnv('ADMIN_BOOTSTRAP_UIDS', '')
  vi.stubEnv('NEXT_PUBLIC_ADMIN_UIDS', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('UGC boundary helpers', () => {
  it('detects UGC by source or type, case/space-insensitive', () => {
    expect(isUgcDraft({ source: 'ugc' })).toBe(true)
    expect(isUgcDraft({ type: ' UGC ' })).toBe(true)
    expect(isUgcDraft({ source: 'AA', type: 'news' })).toBe(false)
    expect(isUgcDraft(null)).toBe(false)
  })
  it('partitions bulk candidates', () => {
    const r = partitionBulkApprovalCandidates([{ source: 'ugc' }, { source: 'AA' }, { type: 'ugc' }], (x) => x)
    expect(r.eligible).toHaveLength(1)
    expect(r.ugcExcluded).toHaveLength(2)
  })
  it('UGC can never yield a crawler raw-article id; crawler drafts still can', () => {
    expect(crawlerRawArticleIdForPublication({ source: 'ugc', rssGuid: 'raw_x' })).toBeNull()
    expect(crawlerRawArticleIdForPublication({ source: 'AA', rssGuid: 'raw_x' })).toBe('raw_x')
    expect(crawlerRawArticleIdForPublication({ source: 'AA', rssGuid: 'https://x' })).toBeNull()
  })
  it('byline comes only from the user profile', () => {
    expect(buildUgcBylineFromUserDoc({ username: 'okur_ali', displayName: 'Ali' })).toEqual({
      author: 'okur_ali', authorDisplayName: 'Ali', authorUsername: 'okur_ali',
    })
    expect(buildUgcBylineFromUserDoc(null)).toEqual({ author: 'Okur', authorDisplayName: 'Okur' })
  })
  it('normalization strips every privileged field', () => {
    const out = normalizeUgcDraftForPublication(ugcDraft(ATTACKER_FIELDS), { author: 'a', authorDisplayName: 'A' })
    for (const k of ['featured', 'isEditorPick', 'localFeatured', 'aiEditorId', 'authorUsername', 'authorPhotoURL',
      'rssGuid', 'sourceUrl', 'sourceLabel', 'ingestionSourceId', 'editorId', 'rightsStatus', 'originalContent']) {
      expect(out).not.toHaveProperty(k)
    }
    expect(out).toMatchObject({ isBreaking: false, breakingScore: 0, priorityScore: 0, isPinned: false, isTrending: false, source: 'ugc', aiGenerated: false })
  })
})

describe('approveDraft — UGC at the canonical publication boundary', () => {
  it('bulk mode refuses UGC: no publication, no crawler mutation', async () => {
    drafts().set('d-ugc', ugcDraft(ATTACKER_FIELDS))
    await expect(newsDraftService.approveDraft('d-ugc', { uid: 'u-me' }, { mode: 'bulk' })).rejects.toThrow(
      UGC_REQUIRES_INDIVIDUAL_REVIEW
    )
    expect(news()).toHaveLength(0)
    expect(drafts().get('d-ugc')?.draftStatus).toBe('pending_review')
    expect(syncCrawlerEditorial).not.toHaveBeenCalled()
  })

  it('individual approval publishes UGC without attacker placement/byline/provenance', async () => {
    drafts().set('d-ugc', ugcDraft(ATTACKER_FIELDS))
    const r = await newsDraftService.approveDraft('d-ugc', { uid: 'u-me' })
    const pub = colMap('news').get(r.newsId)!
    expect(pub.featured).toBeUndefined()
    expect(pub.isEditorPick).toBeUndefined()
    expect(pub.localFeatured).toBeUndefined()
    expect(pub.aiAutoPublished).toBeUndefined()
    expect(pub).toMatchObject({ isBreaking: false, breakingScore: 0, priorityScore: 0, isPinned: false, isTrending: false })
    // byline = submitter's own profile, never the staff persona the draft claimed
    expect(pub).toMatchObject({ authorId: 'u-reader', author: 'okur_ali', authorUsername: 'okur_ali', authorDisplayName: 'Ali Okur' })
    expect(pub.authorPhotoURL).toBeUndefined()
    expect(pub.aiEditorId).toBeUndefined()
    expect(pub.articleFormat).toBeUndefined()
    expect(pub.editorId).toBeUndefined()
    // provenance: reader content, no crawler linkage
    expect(pub).toMatchObject({ source: 'ugc', type: 'ugc', sourceLabel: 'ugc', rssGuid: '', sourceUrl: '', ingestionSourceId: '', aiGenerated: false })
    expect(pub.approvedBy).toBe('u-me')
    expect(syncCrawlerEditorial).not.toHaveBeenCalled()
    expect(drafts().get('d-ugc')?.draftStatus).toBe('approved')
  })

  it('UGC with rssGuid=raw_… cannot mark the crawler raw article published (individual route)', async () => {
    drafts().set('d-ugc', ugcDraft({ rssGuid: 'raw_victim123' }))
    const res = await approveOne(req('/api/admin/news-drafts/d-ugc/approve', 't-me'), { params: Promise.resolve({ id: 'd-ugc' }) })
    expect(res.status).toBe(200)
    expect(syncCrawlerEditorial).not.toHaveBeenCalled()
  })

  it('regression: a crawler draft still syncs its raw article on approval', async () => {
    drafts().set('d-ai', aiDraft())
    await newsDraftService.approveDraft('d-ai', { uid: 'u-me' }, { mode: 'bulk' })
    expect(syncCrawlerEditorial).toHaveBeenCalledWith(expect.objectContaining({ rawArticleId: 'raw_ai1', status: 'published' }))
  })
})

describe('bulk paths skip UGC (server-enforced)', () => {
  it('bulk-approve approves crawler drafts and leaves UGC pending', async () => {
    drafts().set('d-ugc', ugcDraft(ATTACKER_FIELDS))
    drafts().set('d-ugc-type', ugcDraft({ source: 'reader', type: 'ugc' }))
    drafts().set('d-ai', aiDraft())
    const res = await bulkApprove(req('/api/admin/news-drafts/bulk-approve', 't-me', {}))
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, approved: 1, ugcExcluded: 2, total: 1 })
    expect(drafts().get('d-ugc')?.draftStatus).toBe('pending_review')
    expect(drafts().get('d-ugc-type')?.draftStatus).toBe('pending_review')
    expect(drafts().get('d-ai')?.draftStatus).toBe('approved')
    expect(news().some((n) => n.source === 'ugc' || n.type === 'ugc')).toBe(false)
    expect(syncCrawlerEditorial).toHaveBeenCalledTimes(1)
    expect(syncCrawlerEditorial).toHaveBeenCalledWith(expect.objectContaining({ rawArticleId: 'raw_ai1' }))
  })

  it('bulk-approve minConfidence cannot smuggle UGC (confidenceScore is attacker-set)', async () => {
    drafts().set('d-ugc', ugcDraft({ confidenceScore: 100 }))
    const res = await bulkApprove(req('/api/admin/news-drafts/bulk-approve', 't-me', { minConfidence: 99 }))
    expect(await res.json()).toMatchObject({ approved: 0, ugcExcluded: 1 })
    expect(news()).toHaveLength(0)
  })

  it('flush-pending approves recent crawler drafts and leaves UGC pending', async () => {
    drafts().set('d-ugc', ugcDraft(ATTACKER_FIELDS))
    drafts().set('d-ai', aiDraft())
    const res = await flushPending(req('/api/admin/newsroom/flush-pending', 't-me', {}))
    const json = await res.json()
    expect(json.drafts).toMatchObject({ approved: 1, ugcExcluded: 1, total: 1 })
    expect(drafts().get('d-ugc')?.draftStatus).toBe('pending_review')
    expect(drafts().get('d-ai')?.draftStatus).toBe('approved')
    expect(news().some((n) => n.source === 'ugc')).toBe(false)
  })

  it('scoped staff still cannot reach either bulk path (Phase 1 fail-closed)', async () => {
    drafts().set('d-ai', aiDraft())
    expect((await bulkApprove(req('/api/admin/news-drafts/bulk-approve', 't-scoped', {}))).status).toBe(401)
    expect((await flushPending(req('/api/admin/newsroom/flush-pending', 't-scoped', {}))).status).toBe(401)
    expect(drafts().get('d-ai')?.draftStatus).toBe('pending_review')
  })

  it('draft-reprocess (AI path, only live when LEGACY_DIRECT_AI_ENABLED=true) never sends UGC to AI', async () => {
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', 'true')
    drafts().set('d-ugc', ugcDraft(ATTACKER_FIELDS))
    drafts().set('d-ai', aiDraft({ sourceUrl: 'https://example.invalid/ai' }))
    await reprocessPendingDrafts()
    expect(processNewsroomArticle).toHaveBeenCalledTimes(1)
    expect(processNewsroomArticle.mock.calls[0]![2]).toEqual({ reprocessDraftId: 'd-ai' })
  })

  it('draft-reprocess stays inert when LEGACY_DIRECT_AI_ENABLED is not true', async () => {
    drafts().set('d-ai', aiDraft())
    const stats = await reprocessPendingDrafts()
    expect(stats.scanned).toBe(0)
    expect(processNewsroomArticle).not.toHaveBeenCalled()
  })
})

describe('/api/ugc/submit stays the only reader write path', () => {
  it('requires a bearer token', async () => {
    const res = await ugcSubmit(req('/api/ugc/submit', null, { title: 'Başlık', description: BODY }))
    expect(res.status).toBe(401)
    expect(drafts().size).toBe(0)
  })

  it('writes a server-built pending_review draft; client-chosen privileged fields are ignored', async () => {
    const res = await ugcSubmit(
      req('/api/ugc/submit', 't-reader', {
        title: 'Okur başlık',
        description: BODY,
        city: 'Çanakkale',
        categoryId: 'gundem',
        ...ATTACKER_FIELDS,
        authorId: 'someone-else',
        draftStatus: 'approved',
        source: 'AA',
      })
    )
    expect(res.status).toBe(200)
    const { id } = await res.json()
    const d = drafts().get(id)!
    expect(d).toMatchObject({
      authorId: 'u-reader',
      author: 'okur_ali',
      authorUsername: 'okur_ali',
      authorDisplayName: 'Ali Okur',
      source: 'ugc',
      type: 'ugc',
      draftStatus: 'pending_review',
      aiGenerated: false,
    })
    for (const k of ['featured', 'isEditorPick', 'isBreaking', 'breakingScore', 'isPinned', 'isTrending', 'aiEditorId',
      'rssGuid', 'sourceUrl', 'sourceLabel', 'rightsStatus', 'authorPhotoURL']) {
      expect(d).not.toHaveProperty(k)
    }
    expect(news()).toHaveLength(0)
  })
})
