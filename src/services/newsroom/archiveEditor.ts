/**
 * Archive Editor — DEPRECATED as primary product path.
 * Weekly backfill to `newsArchive` for search only. Live feed uses autonomous workers + auto-publish.
 *
 * Pipeline: RSS fetch → dedupe → AI rewrite (archive mode) → fact-check
 * → category/geo → write newsArchive (status: archived).
 */
import type { Firestore } from 'firebase-admin/firestore'
import { cityCategoryId, slugifyCity } from '@/lib/location'
import { normalizeCitySlug } from '@/constants/cities'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { buildSourceUrlHash, isNewsItemDuplicate } from '@/lib/newsDedupe'
import { aiNewsEditor, type AiArchiveRewriteResult } from '@/services/aiNewsEditor'
import { fetchRssItems, type RssFeedItem } from '@/services/rss/rssFetcher'
import { BATCH_TARGET_CATEGORIES, getBatchRssSourcesForCategory } from '@/services/rss/batchSources'
import { getRssSources, type RssSourceDefinition } from '@/services/rss/sources'
import {
  BREAKING_NEWS_SOURCE_IDS,
  LOCAL_NEWS_SOURCE_IDS,
  MAX_AI_CALLS_PER_EDITOR,
  NEWSROOM_LOW_CONFIDENCE_THRESHOLD,
} from '@/services/newsroom/config'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import { categoryEngine } from '@/services/newsroom/categoryEngine'
import { factChecker } from '@/services/newsroom/factChecker'
import { geoEngine } from '@/services/newsroom/geoEngine'
import type { ArchiveRunResult } from '@/types/news'

export interface ArchiveEditorOptions {
  /** How many days back to include RSS items (default 90). */
  days?: number
  maxAiCalls?: number
  /** Max items fetched per RSS source before filtering. */
  maxItemsPerSource?: number
}

const DEFAULT_ARCHIVE_DAYS = 90
const DEFAULT_MAX_ITEMS_PER_SOURCE = 40

function emptyArchiveResult(days: number): ArchiveRunResult {
  return {
    editorId: 'archive',
    days,
    sourcesChecked: 0,
    itemsFetched: 0,
    itemsArchived: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    lowConfidence: 0,
    errors: [],
    durationMs: 0,
  }
}

/** Union of default RSS sources + batch category feeds (deduped by feedUrl). */
export function getArchiveRssSources(): RssSourceDefinition[] {
  const byUrl = new Map<string, RssSourceDefinition>()

  for (const src of getRssSources()) {
    byUrl.set(src.feedUrl, src)
  }

  const roleIds = new Set<string>([...LOCAL_NEWS_SOURCE_IDS, ...BREAKING_NEWS_SOURCE_IDS])
  for (const src of getRssSources()) {
    if (roleIds.has(src.id)) {
      byUrl.set(src.feedUrl, src)
    }
  }

  for (const categoryId of BATCH_TARGET_CATEGORIES) {
    for (const src of getBatchRssSourcesForCategory(categoryId)) {
      if (!byUrl.has(src.feedUrl)) {
        byUrl.set(src.feedUrl, src)
      }
    }
  }

  return [...byUrl.values()]
}

function dedupeFeedItems(items: RssFeedItem[]): RssFeedItem[] {
  const seenFingerprint = new Set<string>()
  const seenUrl = new Set<string>()
  const out: RssFeedItem[] = []

  for (const item of items) {
    const urlKey = item.link.trim().toLowerCase()
    if (seenFingerprint.has(item.fingerprint) || seenUrl.has(urlKey)) continue
    seenFingerprint.add(item.fingerprint)
    seenUrl.add(urlKey)
    out.push(item)
  }

  return out
}

function isArchiveRewrite(
  rewritten: Awaited<ReturnType<typeof aiNewsEditor.rewriteArticle>>
): rewritten is AiArchiveRewriteResult {
  return 'summary' in rewritten && typeof rewritten.summary === 'string'
}

async function processArchiveItem(
  db: Firestore,
  item: RssFeedItem
): Promise<'archived' | 'failed' | 'lowConfidence'> {
  try {
    const rewritten = await aiNewsEditor.rewriteArticle({
      sourceLabel: item.source.label,
      originalTitle: item.title,
      originalSummary: item.summary,
      originalContent: item.content,
      sourceUrl: item.link,
      mode: 'archive',
    })

    const factCheck = await factChecker.check({
      sourceLabel: item.source.label,
      sourceUrl: item.link,
      originalTitle: item.title,
      originalSummary: item.summary,
      rewritten,
    })

    const geo = geoEngine.enrich(rewritten, [])
    const resolvedCategoryRaw = categoryEngine.resolve(rewritten.categoryId, 'local')
    const classification = categoryEngine.validate({
      aiCategoryId: resolvedCategoryRaw,
      categoryConfidence: rewritten.categoryConfidence,
      aiIsBreaking: rewritten.isBreaking,
      title: rewritten.title,
      body: rewritten.description,
      editorType: 'local',
    })
    const citySlug = geo.city ? normalizeCitySlug(slugifyCity(geo.city)) : ''
    const resolvedCategory = classification.categoryId || (citySlug ? cityCategoryId(citySlug) : 'gundem')

    const summary = rewritten.summary || rewritten.description.slice(0, 280)

    const now = Date.now()
    const sourceHash = buildSourceUrlHash(item.link)

    const doc = {
      title: rewritten.title,
      summary,
      content: rewritten.description,
      categoryId: resolvedCategory,
      city: geo.city ?? '',
      district: geo.district ?? '',
      citySlug,
      country: geo.country,
      source: item.source.label,
      sourceUrl: item.link,
      fingerprint: item.fingerprint,
      sourceHash,
      publishedAt: item.publishedAt,
      archivedAt: now,
      tags: geo.tags,
      confidenceScore: factCheck.confidenceScore,
      factCheckFlags: factCheck.flags,
      editorId: 'archive' as const,
      status: 'archived' as const,
      aiGenerated: true,
      originalTitle: item.title,
      sourceLabel: item.source.label,
      ingestionSourceId: item.source.id,
      rssGuid: item.guid,
      thumbnail: item.imageUrl ?? '',
      createdAt: now,
      updatedAt: now,
    }

    await db.collection(Collections.NEWS_ARCHIVE).add(doc)

    const lowConfidence = factCheck.confidenceScore < NEWSROOM_LOW_CONFIDENCE_THRESHOLD
    return lowConfidence ? 'lowConfidence' : 'archived'
  } catch (error) {
    console.error('[archiveEditor] failed:', item.link, error)
    return 'failed'
  }
}

export async function runArchiveEditor(
  options: ArchiveEditorOptions = {}
): Promise<ArchiveRunResult> {
  const started = Date.now()
  const days = Math.min(Math.max(options.days ?? DEFAULT_ARCHIVE_DAYS, 1), 120)
  const maxAiCalls = options.maxAiCalls ?? MAX_AI_CALLS_PER_EDITOR
  const maxItemsPerSource = options.maxItemsPerSource ?? DEFAULT_MAX_ITEMS_PER_SOURCE
  const minPublishedAt = Date.now() - days * 86_400_000

  const result = emptyArchiveResult(days)
  if (!isLegacyDirectAiEnabled()) {
    result.errors.push('LEGACY_DIRECT_AI_ENABLED=false')
    result.durationMs = Date.now() - started
    return result
  }
  const db = getAdminFirestore()
  const sources = getArchiveRssSources()
  let aiCalls = 0

  const allItems: RssFeedItem[] = []

  for (const source of sources) {
    result.sourcesChecked += 1
    try {
      const items = await fetchRssItems(source, {
        minPublishedAt,
        maxItems: maxItemsPerSource,
      })
      allItems.push(...items)
    } catch (error) {
      const msg = `[archive:${source.id}] RSS fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`
      console.warn(msg)
      result.errors.push(msg)
    }
  }

  const candidates = dedupeFeedItems(allItems).sort(
    (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
  )
  result.itemsFetched = candidates.length

  for (const item of candidates) {
    if (aiCalls >= maxAiCalls) {
      result.errors.push(`AI call cap (${maxAiCalls}) reached`)
      break
    }

    if (await isNewsItemDuplicate(db, item.fingerprint, item.link)) {
      result.itemsSkipped += 1
      continue
    }

    const outcome = await processArchiveItem(db, item)
    aiCalls += 1

    if (outcome === 'archived' || outcome === 'lowConfidence') {
      result.itemsArchived += 1
      if (outcome === 'lowConfidence') result.lowConfidence += 1
    } else {
      result.itemsFailed += 1
    }
  }

  result.durationMs = Date.now() - started
  return result
}

/** CLI / cron entry point. */
export const archiveEditor = {
  run: runArchiveEditor,
  getSources: getArchiveRssSources,
}
