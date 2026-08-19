import { describe, expect, it, vi } from 'vitest'
import { MemoryCrawlerStore } from '../store/memory'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '../dispatch'
import { isLegacyDirectAiEnabled } from '../legacyFlags'
import {
  assertNoAiDispatch,
  BULK_ID_CAP,
  runArticleBulk,
  runClusterBulk,
} from './bulk'
import { authorizeCrawlerBulk } from './rbac'
import { summarizeArticleMedia } from './mediaSummary'
import {
  clearSelection,
  pageSelectionHint,
  reconcileSelection,
  selectAllMatching,
  selectCurrentPage,
  selectedCount,
  selectionFilterKey,
  toggleRow,
} from './selection'
import type { InsertRawArticleInput } from '../store/types'
import type { CmsRole } from '@/types/cms'
import type { ArticleMediaRecord, NewsSourceRecord } from '../types'

const NOW = new Date('2026-08-19T12:00:00Z')
const editor: { uid: string; role: CmsRole; email: string } = {
  uid: 'ed_1',
  role: 'editor',
  email: 'editor@nahaber.com',
}
const admin: { uid: string; role: CmsRole; email: string } = {
  uid: 'sa_1',
  role: 'super_admin',
  email: 'mehmetsentc@gmail.com',
}

async function seedSource(store: MemoryCrawlerStore, name = 'AA') {
  return store.insertSource({
    name,
    domain: `${name.toLowerCase()}.test`,
    baseUrl: `https://${name.toLowerCase()}.test`,
    countryCode: 'TR',
    language: 'tr',
    city: 'Çanakkale',
  })
}

async function seedArticle(
  store: MemoryCrawlerStore,
  source: NewsSourceRecord,
  title: string,
  opts?: Partial<InsertRawArticleInput>
) {
  return store.insertRawArticle({
    sourceId: source.id,
    discoveredUrlId: null,
    originalUrl: `https://${source.domain}/${title}`,
    normalizedUrl: `https://${source.domain}/${title}`,
    canonicalUrl: `https://${source.domain}/${title}`,
    urlHash: title,
    title,
    description: title,
    articleBodyText: title,
    articleBodyHtml: `<p>${title}</p>`,
    author: null,
    publishedAt: NOW,
    modifiedAt: null,
    language: 'tr',
    countryCode: 'TR',
    region: null,
    city: 'Çanakkale',
    district: null,
    mainImageUrl: null,
    imageUrls: [],
    videoUrls: [],
    wordCount: 40,
    charCount: 200,
    paragraphCount: 1,
    contentHash: `h-${title}`,
    titleHash: `t-${title}`,
    simhash: null,
    extractionMethod: 'semantic-html',
    extractionConfidence: 0.9,
    httpStatus: 200,
    fetchDurationMs: 10,
    fetchedAt: NOW,
    ...opts,
  })
}

describe('phase 4A.1 bulk editorial triage', () => {
  it('A-C page checkbox, select current page, filter change clears selection', () => {
    const key1 = selectionFilterKey({ city: 'çanakkale', status: '' })
    const page = selectCurrentPage(['a', 'b', 'c'], key1, 80)
    expect(page.ids).toEqual(['a', 'b', 'c'])
    expect(page.mode).toBe('page')
    expect(pageSelectionHint(page, 25)).toContain('3')
    const toggled = toggleRow(page, 'b', ['a', 'b', 'c'])
    expect(toggled.ids).not.toContain('b')
    const key2 = selectionFilterKey({ city: 'istanbul', status: '' })
    expect(key1).not.toBe(key2)
    const cleared = reconcileSelection(page, key2)
    expect(cleared.ids).toEqual([])
    expect(cleared.mode).toBe('none')
    expect(selectedCount(cleared, 25)).toBe(0)
  })

  it('D server-side select-all-matching uses filter not browser ids', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await seedArticle(store, src, 'bir')
    await seedArticle(store, src, 'iki')
    await seedArticle(store, src, 'üç', { city: 'İstanbul' })
    const matching = selectAllMatching(selectionFilterKey({ city: 'Çanakkale' }), 2)
    expect(matching.ids).toEqual([])
    expect(matching.mode).toBe('matching')
    const result = await runArticleBulk({
      store,
      actor: editor,
      op: 'review',
      matchFilter: true,
      filter: { city: 'Çanakkale' },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(2)
    expect(result.requested).toBe(2)
  })

  it('E bulk review / F reject / G reason / H archive', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'r1')
    const b = await seedArticle(store, src, 'r2')
    const c = await seedArticle(store, src, 'r3')
    const review = await runArticleBulk({ store, actor: editor, op: 'review', ids: [a.id, b.id] })
    if ('error' in review) throw new Error(review.error)
    expect(review.affected).toBe(2)
    expect((await store.getRawArticle(a.id))?.editorialStatus).toBe('IN_REVIEW')
    const reject = await runArticleBulk({
      store,
      actor: editor,
      op: 'reject',
      ids: [b.id],
      reason: 'DUPLICATE',
      note: 'aynı olay',
    })
    if ('error' in reject) throw new Error(reject.error)
    const rejected = await store.getRawArticle(b.id)
    expect(rejected?.editorialStatus).toBe('REJECTED')
    expect(rejected?.rejectionReason).toBe('DUPLICATE')
    expect(rejected?.rejectionNote).toBe('aynı olay')
    expect(rejected?.rejectedBy).toBe(editor.uid)
    const arch = await runArticleBulk({ store, actor: editor, op: 'archive', ids: [c.id] })
    if ('error' in arch) throw new Error(arch.error)
    expect((await store.getRawArticle(c.id))?.editorialStatus).toBe('ARCHIVED')
  })

  it('I hard delete permission; J read-only denial', async () => {
    expect(authorizeCrawlerBulk('video_editor', 'review').ok).toBe(false)
    expect(authorizeCrawlerBulk('author', 'archive').ok).toBe(false)
    expect(authorizeCrawlerBulk('editor', 'hard_delete').ok).toBe(false)
    expect(authorizeCrawlerBulk('super_admin', 'hard_delete').ok).toBe(true)
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'del')
    const denied = await runArticleBulk({
      store,
      actor: { uid: 'v', role: 'video_editor', email: 'v@x' },
      op: 'review',
      ids: [a.id],
    })
    expect('error' in denied).toBe(true)
  })

  it('K algorithmic eligibility preserved after human decision', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src, 'evt')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'yol',
      countryCode: 'TR',
      city: 'Çanakkale',
    })
    await store.updateCluster(cluster.id, { aiEligibility: 'ELIGIBLE' })
    const result = await runClusterBulk({
      store,
      actor: editor,
      op: 'approve_for_ai',
      ids: [cluster.id],
    })
    if ('error' in result) throw new Error(result.error)
    const after = await store.getCluster(cluster.id)
    expect(after?.editorialDecision).toBe('APPROVED_FOR_AI')
    expect(after?.aiEligibility).toBe('ELIGIBLE')
  })

  it('L AI approval does not dispatch; M dispatch false blocks provider', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const article = await seedArticle(store, src, 'aiok')
    const cluster = await store.insertCluster({
      representativeArticleId: article.id,
      normalizedTopic: 'ok',
      countryCode: 'TR',
      city: 'Çanakkale',
    })
    await store.updateCluster(cluster.id, { aiEligibility: 'HIGH_PRIORITY' })
    const result = await runClusterBulk({ store, actor: editor, op: 'approve_for_ai', ids: [cluster.id] })
    if ('error' in result) throw new Error(result.error)
    expect(result.dispatchAttempted).toBe(false)
    expect(result.aiRequests).toBe(0)
    expect(result.dispatchEnabled).toBe(false)
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    const gate = dispatchCrawlerArticleToNewsroom({ articleId: article.id })
    expect(gate.aiRequests).toBe(0)
    expect(gate.dispatched).toBe(false)
    expect(assertNoAiDispatch().aiRequests).toBe(0)
  })

  it('N mixed-state batch returns affected/skipped; O idempotent repeat', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'm1')
    const b = await seedArticle(store, src, 'm2', { editorialStatus: 'PUBLISHED' })
    const first = await runArticleBulk({ store, actor: editor, op: 'ai_candidate', ids: [a.id, b.id] })
    if ('error' in first) throw new Error(first.error)
    expect(first.affected).toBe(1)
    expect(first.skipped).toBe(1)
    const second = await runArticleBulk({ store, actor: editor, op: 'ai_candidate', ids: [a.id] })
    if ('error' in second) throw new Error(second.error)
    expect(second.affected).toBe(0)
    expect(second.skipped).toBe(1)
  })

  it('P audit records created', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'aud')
    await runArticleBulk({ store, actor: editor, op: 'review', ids: [a.id] })
    const audits = await store.listEditorialAudits()
    expect(audits.length).toBe(1)
    expect(audits[0].actorId).toBe(editor.uid)
    expect(audits[0].action).toBe('review')
    expect(audits[0].affectedCount).toBe(1)
  })

  it('Q combined filter bulk action', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    await seedArticle(store, src, 'gorsel', { mainImageUrl: 'https://x.test/a.jpg', countryCode: 'TR' })
    await seedArticle(store, src, 'yok', { countryCode: 'TR' })
    await seedArticle(store, src, 'de', { countryCode: 'DE', mainImageUrl: 'https://x.test/b.jpg' })
    const result = await runArticleBulk({
      store,
      actor: editor,
      op: 'review',
      matchFilter: true,
      filter: { country: 'TR', hasImage: true },
    })
    if ('error' in result) throw new Error(result.error)
    expect(result.affected).toBe(1)
  })

  it('R CSRF/auth protections remain intact', () => {
    expect(authorizeCrawlerBulk('user', 'review').ok).toBe(false)
    expect(BULK_ID_CAP).toBe(500)
  })

  it('S crawler can continue during bulk operations', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'live')
    const bulk = runArticleBulk({ store, actor: editor, op: 'archive', ids: [a.id] })
    const extra = await seedArticle(store, src, 'concurrent')
    await bulk
    expect(extra.id).toBeTruthy()
    expect((await store.getRawArticle(extra.id))?.editorialStatus).toBe('NEW')
  })

  it('soft-delete tombstones when cluster/media relations exist; super_admin hard-deletes orphans', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const linked = await seedArticle(store, src, 'linked')
    const orphan = await seedArticle(store, src, 'orphan')
    const cluster = await store.insertCluster({
      representativeArticleId: linked.id,
      normalizedTopic: 'x',
      countryCode: 'TR',
      city: 'Çanakkale',
    })
    await store.insertMembership({
      clusterId: cluster.id,
      articleId: linked.id,
      sourceId: src.id,
      similarityScore: 1,
      matchBand: 'HIGH',
    })
    const tomb = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [linked.id] })
    if ('error' in tomb) throw new Error(tomb.error)
    expect(tomb.tombstoned).toBe(1)
    expect(await store.getRawArticle(linked.id)).toBeTruthy()
    expect((await store.getRawArticle(linked.id))?.editorialStatus).toBe('DELETED')
    const hard = await runArticleBulk({ store, actor: admin, op: 'delete', ids: [orphan.id] })
    if ('error' in hard) throw new Error(hard.error)
    expect(hard.hardDeleted).toBe(1)
    expect(await store.getRawArticle(orphan.id)).toBeNull()
  })

  it('editor delete tombstones instead of hard delete', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'soft')
    const result = await runArticleBulk({ store, actor: editor, op: 'delete', ids: [a.id] })
    if ('error' in result) throw new Error(result.error)
    expect(result.tombstoned).toBe(1)
    expect(result.hardDeleted).toBe(0)
    expect((await store.getRawArticle(a.id))?.editorialStatus).toBe('DELETED')
  })

  it('AI candidate / reject / archive do not call DeepSeek or enable dispatch', async () => {
    let deepseek = 0
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('deepseek')) deepseek += 1
      throw new Error('network should not run')
    }) as typeof fetch
    try {
      const store = new MemoryCrawlerStore()
      const src = await seedSource(store)
      const a = await seedArticle(store, src, 'noai')
      const cl = await store.insertCluster({
        representativeArticleId: a.id,
        normalizedTopic: 'n',
        countryCode: 'TR',
        city: 'Çanakkale',
      })
      await runArticleBulk({ store, actor: editor, op: 'ai_candidate', ids: [a.id] })
      await runArticleBulk({
        store,
        actor: editor,
        op: 'reject',
        ids: [a.id],
        reason: 'NO_NEWS_VALUE',
      })
      await runClusterBulk({ store, actor: editor, op: 'archive', ids: [cl.id] })
      expect(deepseek).toBe(0)
      expect(isLegacyDirectAiEnabled()).toBe(false)
      expect(isCrawlerAiDispatchEnabled()).toBe(false)
      expect(dispatchCrawlerArticleToNewsroom().aiRequests).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('media summary uses existing hashes without vision AI', () => {
    const media: ArticleMediaRecord[] = [
      {
        id: '1',
        articleId: 'a',
        mediaType: 'image',
        sourceUrl: 'https://x/a.jpg',
        normalizedUrl: 'https://x/a.jpg',
        width: 800,
        height: 600,
        altText: null,
        caption: null,
        credit: null,
        mimeType: 'image/jpeg',
        discoveryMethod: 'og',
        score: 1,
        isPrimary: true,
        status: 'ACCEPTED',
        rejectionReason: null,
        qualityScore: 1,
        contentHash: 'same',
        perceptualHash: null,
        createdAt: NOW,
      },
      {
        id: '2',
        articleId: 'a',
        mediaType: 'image',
        sourceUrl: 'https://x/b.jpg',
        normalizedUrl: 'https://x/b.jpg',
        width: 800,
        height: 600,
        altText: null,
        caption: null,
        credit: null,
        mimeType: 'image/jpeg',
        discoveryMethod: 'dom',
        score: 0.5,
        isPrimary: false,
        status: 'ACCEPTED',
        rejectionReason: null,
        qualityScore: 0.5,
        contentHash: 'same',
        perceptualHash: null,
        createdAt: NOW,
      },
      {
        id: '3',
        articleId: 'a',
        mediaType: 'image',
        sourceUrl: 'https://x/ad.jpg',
        normalizedUrl: 'https://x/ad.jpg',
        width: 100,
        height: 100,
        altText: null,
        caption: null,
        credit: null,
        mimeType: 'image/jpeg',
        discoveryMethod: 'dom',
        score: 0,
        isPrimary: false,
        status: 'REJECTED',
        rejectionReason: 'ad',
        qualityScore: 0,
        contentHash: 'ad',
        perceptualHash: null,
        createdAt: NOW,
      },
    ]
    const summary = summarizeArticleMedia(media)
    expect(summary.mediaCount).toBe(3)
    expect(summary.duplicateCount).toBe(1)
    expect(summary.rejectedCount).toBe(1)
    expect(summary.primaryUrl).toBe('https://x/a.jpg')
  })

  it('AI candidate never publishes', async () => {
    const store = new MemoryCrawlerStore()
    const src = await seedSource(store)
    const a = await seedArticle(store, src, 'pub')
    await runArticleBulk({ store, actor: editor, op: 'ai_candidate', ids: [a.id] })
    expect((await store.getRawArticle(a.id))?.editorialStatus).toBe('AI_CANDIDATE')
    expect((await store.getRawArticle(a.id))?.editorialNewsId).toBeNull()
  })
})
