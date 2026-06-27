/**
 * FreeNewsAPI worker — freenewsapi.io üzerinden Türkçe haber çekimi.
 *
 * API: https://freenewsapi.io (5,000 istek/gün, 2 istek/sn)
 * Auth: x-api-key header
 * Filtre: language=tr, order_by=published_at
 *
 * Strateji:
 *   1. /v1/news ile son haberleri listele (10 adet, yalnızca başlık+uuid)
 *   2. Fingerprint ile daha önce işlenenler atlanır
 *   3. Yeni haberler için /v1/details ile tam içerik çekilir
 *   4. freenewsapi topic → NaHaber kategori eşlemesi yapılır
 *   5. Pipeline'a kuyruğa alınır (AI Türkçeleştirme + yayınlama)
 *
 * Cron: her 30 dakikada bir
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import {
  loadSourceFingerprints,
  upsertSourceFingerprint,
  type SourceArticleFingerprint,
} from '@/services/newsroom/detection/sourceFingerprint'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

const API_BASE = 'https://api.freenewsapi.io/v1'
const SOURCE_ID = 'freenewsapi'
const WORKER_ID = 'freenews' as const
const MAX_ITEMS_PER_RUN = 10
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 saat

interface FreeNewsItem {
  uuid: string
  title: string
  published_at: string
  publisher: string
}

interface FreeNewsDetails {
  uuid: string
  title: string
  thumbnail?: string
  publisher: string
  topics?: string[]
  countries?: string[]
  languages?: string[]
  published_at: string
  original_url: string
  body?: string
}

/** freenewsapi topic → NaHaber categoryId eşlemesi */
function mapTopicToCategory(topics: string[] = []): string {
  const t = topics.map((x) => x.toLowerCase())
  if (t.some((x) => ['politics'].includes(x))) return 'siyaset'
  if (t.some((x) => ['world'].includes(x))) return 'dunya'
  if (t.some((x) => ['economy', 'finance', 'business', 'personal finance'].includes(x))) return 'ekonomi'
  if (t.some((x) => ['technology', 'gadgets', 'internet security', 'robotics', 'mobile', 'gaming'].includes(x))) return 'teknoloji'
  if (t.some((x) => ['health', 'medicine', 'mental health', 'nutrition', 'public health'].includes(x))) return 'saglik'
  if (t.some((x) => ['soccer', 'football', 'sports', 'basketball', 'tennis', 'combat sports'].includes(x))) return 'spor'
  if (t.some((x) => ['science', 'space', 'physics', 'neuroscience', 'geology', 'paleontology'].includes(x))) return 'bilim'
  if (t.some((x) => ['entertainment', 'celebrities', 'music', 'movies', 'tv', 'theater'].includes(x))) return 'magazin'
  if (t.some((x) => ['food', 'gastronomi'].includes(x))) return 'gastronomi'
  if (t.some((x) => ['vehicles'].includes(x))) return 'otomobil'
  return 'gundem'
}

async function fetchJson<T>(url: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function runFreeNewsApiWorker(): Promise<NewsroomRunResult> {
  const started = Date.now()
  const result = emptyNewsroomResult(WORKER_ID)
  const db = getAdminFirestore()

  const apiKey = process.env.FREENEWS_API_KEY
  if (!apiKey) {
    result.errors.push('[freenews] FREENEWS_API_KEY env var eksik')
    result.durationMs = Date.now() - started
    return result
  }

  // Mevcut fingerprintleri yükle (dedupe)
  let stored: Awaited<ReturnType<typeof loadSourceFingerprints>>
  try {
    stored = await loadSourceFingerprints(db, SOURCE_ID)
  } catch (e) {
    result.errors.push(`[freenews] Firestore fingerprint read failed: ${e instanceof Error ? e.message : e}`)
    result.durationMs = Date.now() - started
    return result
  }

  // Son Türkçe haberleri listele
  const listUrl = `${API_BASE}/news?language=tr&order_by=published_at&page_size=20`
  const listResp = await fetchJson<{ data: FreeNewsItem[] }>(listUrl, apiKey)
  if (!listResp?.data?.length) {
    result.errors.push('[freenews] /v1/news yanıtı boş veya başarısız')
    result.durationMs = Date.now() - started
    return result
  }

  result.sourcesChecked = 1
  const now = Date.now()
  const cutoff = now - MAX_AGE_MS
  let newCount = 0

  for (const item of listResp.data) {
    if (newCount >= MAX_ITEMS_PER_RUN) break

    const hash = `freenews-${item.uuid}`

    // Zaten işlenmiş mi?
    if (stored.has(hash)) {
      result.itemsSkipped++
      continue
    }

    result.itemsFetched++

    // Yayın tarihi kontrolü
    const publishedMs = new Date(item.published_at).getTime()
    if (isNaN(publishedMs) || publishedMs < cutoff) {
      result.itemsSkipped++
      continue
    }

    // Tam makale detayını çek
    const detailUrl = `${API_BASE}/details?uuid=${item.uuid}`
    const detail = await fetchJson<{ data: FreeNewsDetails }>(detailUrl, apiKey)
    const d = detail?.data

    if (!d) {
      result.itemsSkipped++
      continue
    }

    const categoryId = mapTopicToCategory(d.topics)
    const body = d.body ?? d.title

    const fingerprint: SourceArticleFingerprint = {
      hash,
      guid: d.uuid,
      link: d.original_url,
      title: d.title,
      titleHash: hash,
      contentHash: hash,
      publishedAt: publishedMs,
      lastSeenAt: now,
    }

    try {
      await enqueueNewsItem(db, {
        workerId: WORKER_ID,
        changeType: 'new',
        input: {
          editorId: WORKER_ID,
          editorType: 'national',
          sourceLabel: d.publisher || 'FreeNewsAPI',
          sourceUrl: d.original_url,
          originalTitle: d.title,
          originalSummary: d.title,
          originalContent: body,
          imageUrl: d.thumbnail ?? undefined,
          rssFingerprint: hash,
          rssGuid: d.uuid,
          ingestionSourceId: SOURCE_ID,
          sourcePublishedAt: publishedMs,
          forcedCategoryId: categoryId,
          extraTags: ['freenewsapi', ...(d.topics ?? []).slice(0, 3)],
        },
        sourceId: SOURCE_ID,
        fingerprintHash: hash,
      })
      await upsertSourceFingerprint(db, SOURCE_ID, fingerprint)
      result.itemsNew++
      newCount++
    } catch (e) {
      const msg = `[freenews] enqueue failed for ${d.uuid}: ${e instanceof Error ? e.message : e}`
      console.warn(msg)
      result.errors.push(msg)
      result.itemsFailed++
    }
  }

  result.durationMs = Date.now() - started
  return result
}
