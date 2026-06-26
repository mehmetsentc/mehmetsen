/**
 * HackerNews worker — top/best stories → fingerprint diff → enqueue → AI çeviri.
 *
 * HN Firebase API (ücretsiz, rate-limit yok):
 *   https://hacker-news.firebaseio.com/v0/beststories.json  → 500 ID
 *   https://hacker-news.firebaseio.com/v0/item/<id>.json    → item detayı
 *
 * Filtreler:
 *   - score >= MIN_SCORE (varsayılan 150)
 *   - publishedAt < MAX_AGE_MS (varsayılan 18 saat)
 *   - type == 'story' ve url alanı var (yorum/Ask HN hariç)
 *
 * Kategori: teknoloji (varsayılan) — başlığa göre 'dunya' da olabilir.
 * Dil: İngilizce → pipeline'daki translateToTurkish() otomatik çevirir.
 *
 * Cron: her 3 saatte bir — technology cron içinden çalışır
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import {
  loadSourceFingerprints,
  upsertSourceFingerprint,
  type SourceArticleFingerprint,
} from '@/services/newsroom/detection/sourceFingerprint'
import { fetchArticleEnrichment } from '@/services/rss/articleFetcher'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'
const SOURCE_ID = 'hn-api'
const WORKER_ID = 'hackernews' as const
const MIN_SCORE = 150         // düşük kaliteli/niş içerik filtresi
const MAX_ITEMS_PER_RUN = 10  // cron başına max 10 yeni item
const MAX_AGE_MS = 18 * 60 * 60 * 1000 // 18 saat

interface HnItem {
  id: number
  type: string
  title?: string
  url?: string
  score?: number
  time?: number   // Unix seconds
  by?: string
  descendants?: number
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Başlığa göre kategori tahmini: dünya/siyaset ise 'dunya', aksi halde 'teknoloji' */
function guessCategoryId(title: string): string {
  const worldKeywords = /\b(war|conflict|ukraine|russia|china|iran|israel|gaza|nato|un |europe|election|president|government|minister|sanction|climate|disaster|earthquake|flood|hurricane|pandemic|virus|covid)\b/i
  return worldKeywords.test(title) ? 'dunya' : 'teknoloji'
}

export async function runHackerNewsWorker(): Promise<NewsroomRunResult> {
  const started = Date.now()
  const result = emptyNewsroomResult(WORKER_ID)
  const db = getAdminFirestore()

  // Mevcut fingerprintleri yükle (dedupe)
  let stored: Awaited<ReturnType<typeof loadSourceFingerprints>>
  try {
    stored = await loadSourceFingerprints(db, SOURCE_ID)
  } catch (e) {
    result.errors.push(`[hackernews] Firestore fingerprint read failed: ${e instanceof Error ? e.message : e}`)
    result.durationMs = Date.now() - started
    return result
  }

  // En iyi 500 hikayeyi çek
  const storyIds = await fetchJson<number[]>(`${HN_BASE}/beststories.json`)
  if (!storyIds || storyIds.length === 0) {
    result.errors.push('[hackernews] beststories fetch failed or empty')
    result.durationMs = Date.now() - started
    return result
  }

  result.sourcesChecked = 1
  const now = Date.now()
  const cutoff = now - MAX_AGE_MS
  let newCount = 0

  for (const id of storyIds) {
    if (newCount >= MAX_ITEMS_PER_RUN) break

    const hash = `hn-${id}`

    // Zaten işlenmiş mi?
    if (stored.has(hash)) {
      result.itemsSkipped++
      continue
    }

    // Item detayını çek
    const item = await fetchJson<HnItem>(`${HN_BASE}/item/${id}.json`)
    result.itemsFetched++

    if (
      !item ||
      item.type !== 'story' ||
      !item.url ||
      !item.title ||
      (item.score ?? 0) < MIN_SCORE ||
      !item.time ||
      item.time * 1000 < cutoff
    ) {
      result.itemsSkipped++
      continue
    }

    // Tam makale içeriğini çekmeye çalış
    let fullContent = ''
    let imageUrl: string | undefined
    try {
      const enriched = await fetchArticleEnrichment(item.url)
      if (enriched) {
        fullContent = enriched.bodyText ?? enriched.description ?? ''
        imageUrl = enriched.imageUrl ?? undefined
      }
    } catch {
      // Non-fatal — pipeline başlık+özet ile devam eder
    }

    // İçerik çok kısaysa sadece başlıkla devam et
    if (fullContent.length < 100) {
      fullContent = item.title
    }

    const categoryId = guessCategoryId(item.title)

    const fingerprint: SourceArticleFingerprint = {
      hash,
      guid: String(id),
      link: item.url,
      title: item.title,
      titleHash: hash,
      contentHash: hash,
      publishedAt: item.time * 1000,
      lastSeenAt: now,
    }

    try {
      await enqueueNewsItem(db, {
        workerId: WORKER_ID,
        changeType: 'new',
        input: {
          editorId: WORKER_ID,
          editorType: 'national',
          sourceLabel: 'HackerNews',
          sourceUrl: item.url,
          originalTitle: item.title,
          originalSummary: item.title,   // AI pipeline summary üretir
          originalContent: fullContent,
          imageUrl,
          rssFingerprint: hash,
          rssGuid: String(id),
          ingestionSourceId: SOURCE_ID,
          sourcePublishedAt: item.time * 1000,
          forcedCategoryId: categoryId,
          extraTags: ['hackernews', categoryId === 'dunya' ? 'dunya' : 'teknoloji'],
        },
        sourceId: SOURCE_ID,
        fingerprintHash: hash,
      })
      await upsertSourceFingerprint(db, SOURCE_ID, fingerprint)
      result.itemsNew++
      newCount++
    } catch (e) {
      const msg = `[hackernews] enqueue failed for item ${id}: ${e instanceof Error ? e.message : e}`
      console.warn(msg)
      result.errors.push(msg)
      result.itemsFailed++
    }
  }

  result.durationMs = Date.now() - started
  return result
}
