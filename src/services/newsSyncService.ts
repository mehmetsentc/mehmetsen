import type { Firestore } from 'firebase-admin/firestore'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import {
  getBatchRssSourcesForCategory,
  isWorldCupRelated,
  parseBatchCategories,
  type BatchTargetCategory,
} from '@/services/rss/batchSources'
import { fetchRssItems, type RssFeedItem } from '@/services/rss/rssFetcher'
import { getRssSources } from '@/services/rss/sources'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import type { NewsSyncResult } from '@/types/news'

const MAX_AI_CALLS_PER_RUN = Number(process.env.NEWS_INGEST_MAX_AI_CALLS ?? 12)

const IMPORTANCE_KEYWORDS = [
  'son dakika',
  'acil',
  'kritik',
  'önemli',
  'onemli',
  'tarihi',
  'ilk kez',
  'rekor',
  'deprem',
  'seçim',
  'secim',
  'skandal',
  'kriz',
  'patlama',
  'ölüm',
  'olum',
  'dünya kupası',
  'dunya kupasi',
  'world cup',
  'fifa',
]

export interface BatchIngestOptions {
  categories?: string[]
  days?: number
  maxAiCalls?: number
  perCategory?: number
}

function emptySyncResult(): NewsSyncResult {
  return {
    sourcesChecked: 0,
    itemsFetched: 0,
    itemsNew: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    pendingCreated: 0,
    draftsCreated: 0,
    autoPublished: 0,
    errors: [],
    durationMs: 0,
  }
}

function yesterdayBounds(now: number): { start: number; end: number } {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return { start, end: start + 86_400_000 }
}

function scoreBatchItem(item: RssFeedItem, now: number): number {
  const pub = item.publishedAt ?? 0
  const { start, end } = yesterdayBounds(now)
  let score = 0

  if (pub >= start && pub < end) score += 120
  else if (pub > 0) {
    const ageDays = (now - pub) / 86_400_000
    score += Math.max(0, 40 - ageDays) * 3
  } else {
    score += 5
  }

  const text = `${item.title} ${item.summary} ${item.content}`.toLowerCase()
  for (const kw of IMPORTANCE_KEYWORDS) {
    if (text.includes(kw)) score += 12
  }
  return score
}

function dedupeBatchItems(items: RssFeedItem[]): RssFeedItem[] {
  const seen = new Set<string>()
  const out: RssFeedItem[] = []
  for (const item of items) {
    const key = item.link || item.guid
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

async function fingerprintExists(db: Firestore, fingerprint: string): Promise<boolean> {
  const [newsSnap, draftSnap] = await Promise.all([
    db.collection(Collections.NEWS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
    db.collection(Collections.NEWS_DRAFTS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
  ])
  return !newsSnap.empty || !draftSnap.empty
}

interface ProcessItemOptions {
  forcedCategoryId?: string
  extraTags?: string[]
}

async function processItem(
  db: Firestore,
  item: RssFeedItem,
  options?: ProcessItemOptions
): Promise<'created' | 'published' | 'skipped' | 'failed'> {
  if (await fingerprintExists(db, item.fingerprint)) {
    return 'skipped'
  }

  try {
    const { outcome } = await processNewsroomArticle(db, {
      editorId: 'local-news',
      editorType: 'local',
      sourceLabel: item.source.label,
      sourceUrl: item.link,
      originalTitle: item.title,
      originalSummary: item.summary,
      originalContent: item.content,
      rssFingerprint: item.fingerprint,
      rssGuid: item.guid,
      ingestionSourceId: item.source.id,
      sourcePublishedAt: item.publishedAt,
      forcedCategoryId: options?.forcedCategoryId,
      extraTags: options?.extraTags,
    })

    if (outcome === 'published' || outcome === 'updated') return 'published'
    if (outcome === 'created') return 'created'
    if (outcome === 'skipped') return 'skipped'
    return 'failed'
  } catch (error) {
    console.error('[newsSyncService] processItem failed:', item.link, error)
    return 'failed'
  }
}

export const newsSyncService = {
  async ingestNewsBatch(options: BatchIngestOptions = {}): Promise<NewsSyncResult> {
    if (!isLegacyDirectAiEnabled()) {
      return { ...emptySyncResult(), errors: ['LEGACY_DIRECT_AI_ENABLED=false'] }
    }
    const started = Date.now()
    const result = emptySyncResult()
    const now = Date.now()
    const days = Math.min(Math.max(options.days ?? 30, 1), 60)
    const minPublishedAt = now - days * 86_400_000
    const maxAiCalls = options.maxAiCalls ?? MAX_AI_CALLS_PER_RUN
    const perCategoryLimit = Math.min(Math.max(options.perCategory ?? 3, 1), 8)
    const categories = parseBatchCategories(options.categories?.join(','))

    const db = getAdminFirestore()
    const perCategory: NonNullable<NewsSyncResult['batch']>['perCategory'] = {}
    let aiCalls = 0

    for (const categoryId of categories) {
      perCategory[categoryId] = { fetched: 0, created: 0, skipped: 0, failed: 0 }
      const sources = getBatchRssSourcesForCategory(categoryId as BatchTargetCategory)
      const bucketItems: RssFeedItem[] = []

      for (const source of sources) {
        result.sourcesChecked += 1
        try {
          const items = await fetchRssItems(source, {
            minPublishedAt,
            maxItems: 12,
          })
          bucketItems.push(...items)
        } catch (error) {
          const msg = `[batch:${categoryId}:${source.id}] RSS fetch failed: ${
            error instanceof Error ? error.message : String(error)
          }`
          console.warn(msg)
          result.errors.push(msg)
        }
      }

      const ranked = dedupeBatchItems(bucketItems)
        .map((item) => ({ item, score: scoreBatchItem(item, now) }))
        .sort((a, b) => b.score - a.score || (b.item.publishedAt ?? 0) - (a.item.publishedAt ?? 0))
        .map(({ item }) => item)

      perCategory[categoryId].fetched = ranked.length
      result.itemsFetched += ranked.length

      let createdForCategory = 0
      for (const item of ranked) {
        if (aiCalls >= maxAiCalls) {
          result.errors.push(`AI call cap (${maxAiCalls}) reached — remaining batch items deferred`)
          break
        }
        if (createdForCategory >= perCategoryLimit) break

        const extraTags: string[] = []
        if (categoryId === 'spor') {
          const wcText = `${item.title} ${item.summary} ${item.content}`
          if (isWorldCupRelated(wcText)) {
            extraTags.push('dunya-kupasi', 'world-cup', 'fifa')
          }
        }

        const outcome = await processItem(db, item, {
          forcedCategoryId: categoryId,
          extraTags: extraTags.length > 0 ? extraTags : undefined,
        })
        aiCalls += 1

        if (outcome === 'published') {
          result.itemsNew += 1
          result.autoPublished += 1
        } else if (outcome === 'created') {
          result.itemsNew += 1
          result.draftsCreated += 1
          result.pendingCreated += 1
          perCategory[categoryId].created += 1
          createdForCategory += 1
        } else if (outcome === 'skipped') {
          result.itemsSkipped += 1
          perCategory[categoryId].skipped += 1
        } else {
          result.itemsFailed += 1
          perCategory[categoryId].failed += 1
        }
      }

      if (aiCalls >= maxAiCalls) break
    }

    result.batch = { categories, days, perCategory }
    result.durationMs = Date.now() - started
    return result
  },

  async ingestNews(): Promise<NewsSyncResult> {
    if (!isLegacyDirectAiEnabled()) {
      return { ...emptySyncResult(), errors: ['LEGACY_DIRECT_AI_ENABLED=false'] }
    }
    const started = Date.now()
    const result = emptySyncResult()

    const db = getAdminFirestore()
    const sources = getRssSources()

    if (sources.length === 0) {
      result.errors.push('No RSS sources enabled')
      result.durationMs = Date.now() - started
      return result
    }

    // Sadece son 48 saatteki haberleri al — eski haberlerin yeni gibi yayınlanmasını engelle
    const MAX_AGE_MS = 48 * 60 * 60 * 1000
    const minPublishedAt = Date.now() - MAX_AGE_MS

    let aiCalls = 0

    for (const source of sources) {
      result.sourcesChecked += 1

      let items: RssFeedItem[]
      try {
        items = await fetchRssItems(source, { minPublishedAt })
      } catch (error) {
        const msg = `[${source.id}] RSS fetch failed: ${error instanceof Error ? error.message : String(error)}`
        console.warn(msg)
        result.errors.push(msg)
        continue
      }

      result.itemsFetched += items.length

      for (const item of items) {
        if (aiCalls >= MAX_AI_CALLS_PER_RUN) {
          result.errors.push(`AI call cap (${MAX_AI_CALLS_PER_RUN}) reached — remaining items deferred`)
          break
        }

        const outcome = await processItem(db, item)
        aiCalls += 1

        if (outcome === 'published') {
          result.itemsNew += 1
          result.autoPublished += 1
        } else if (outcome === 'created') {
          result.itemsNew += 1
          result.draftsCreated += 1
          result.pendingCreated += 1
        } else if (outcome === 'skipped') {
          result.itemsSkipped += 1
        } else {
          result.itemsFailed += 1
        }
      }

      if (aiCalls >= MAX_AI_CALLS_PER_RUN) break
    }

    result.durationMs = Date.now() - started
    return result
  },
}
