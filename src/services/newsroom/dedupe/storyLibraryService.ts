/**
 * Processed-story library — cross-source duplicate gate before AI calls.
 * Tracks topics already handled by the newsroom so DHA/ANKA/RSS rewrites
 * of the same story skip DeepSeek/Gemini entirely.
 */
import { createHash } from 'crypto'
import type { Firestore, QuerySnapshot } from 'firebase-admin/firestore'
import { TEKRARLAYAN_CATEGORY_ID } from '@/constants/config'
import { Collections } from '@/lib/firebase/collections'
import {
  computeArticleSimilarity,
  jaccardSimilarity,
} from '@/services/newsroom/dedupe/similarityEngine'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export const STORY_LIBRARY_COLLECTION = Collections.NEWSROOM_STORY_LIBRARY

const LIBRARY_LOOKBACK_MS = 48 * 60 * 60 * 1000
/** Stronger than pipeline dedupe — avoid false positives on unrelated same-day news */
const LIBRARY_SIMILARITY_THRESHOLD = 0.58
const LIBRARY_CANDIDATES = 60

const STOP_WORDS = new Set([
  've', 'bir', 'bu', 'için', 'ile', 'de', 'da', 'den', 'dan', 'the', 'a', 'an', 'in', 'on', 'to',
  'haber', 'son', 'dakika', 'gundem', 'gündem',
])

export type StoryLibraryMatchMethod =
  | 'rssFingerprint'
  | 'sourceUrl'
  | 'topicKey'
  | 'titleSimilarity'

export interface StoryLibraryMatch {
  libraryDocId: string
  firstNewsId: string
  reason: string
  matchMethod: StoryLibraryMatchMethod
  similarity?: number
}

export interface StoryLibraryUpsertInput {
  title: string
  newsId: string
  sourceUrl: string
  rssFingerprint?: string
  editorId?: string
  citySlug?: string | null
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  return new Set(tokens)
}

export function normalizeTitleNorm(title: string): string {
  return title
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Calendar day bucket in Europe/Istanbul (YYYY-MM-DD). */
export function trDateBucket(ts = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(ts))
}

export function buildTopicKey(
  title: string,
  citySlug?: string | null,
  dateBucket?: string
): string {
  const norm = normalizeTitleNorm(title)
  const city = citySlug?.trim().toLowerCase() || 'national'
  const day = dateBucket ?? trDateBucket()
  return `${day}:${city}:${norm.slice(0, 200)}`
}

export function libraryDocIdFromTopicKey(topicKey: string): string {
  return createHash('sha256').update(topicKey).digest('hex').slice(0, 40)
}

export function extractEntityHints(title: string): string[] {
  return [...tokenize(title)].filter((t) => t.length > 4).slice(0, 12)
}

function isDifferentStory(existingNewsId: string | undefined | null, candidate?: string | null): boolean {
  if (!candidate?.trim()) return false
  if (!existingNewsId?.trim()) return true
  return candidate.trim() !== existingNewsId.trim()
}

async function matchFromQuery(
  snap: QuerySnapshot,
  matchMethod: StoryLibraryMatchMethod,
  existingNewsId?: string | null
): Promise<StoryLibraryMatch | null> {
  if (snap.empty) return null
  const doc = snap.docs[0]!
  const data = doc.data() as { firstNewsId?: string }
  const firstNewsId = data.firstNewsId?.trim()
  if (!firstNewsId || !isDifferentStory(existingNewsId, firstNewsId)) return null
  return {
    libraryDocId: doc.id,
    firstNewsId,
    reason: matchMethod,
    matchMethod,
  }
}

/** Cheap lookup — fingerprint / sourceUrl only (enqueue gate). */
export async function findStoryLibraryMatchQuick(
  db: Firestore,
  params: {
    rssFingerprint?: string
    sourceUrl?: string
    existingNewsId?: string | null
  }
): Promise<StoryLibraryMatch | null> {
  const col = db.collection(STORY_LIBRARY_COLLECTION)

  if (params.rssFingerprint?.trim()) {
    const snap = await col
      .where('rssFingerprints', 'array-contains', params.rssFingerprint.trim())
      .limit(1)
      .get()
    const hit = await matchFromQuery(snap, 'rssFingerprint', params.existingNewsId)
    if (hit) return hit
  }

  const sourceUrl = params.sourceUrl?.trim() ?? ''
  if (sourceUrl.startsWith('http')) {
    const snap = await col.where('sourceUrls', 'array-contains', sourceUrl).limit(1).get()
    const hit = await matchFromQuery(snap, 'sourceUrl', params.existingNewsId)
    if (hit) return hit
  }

  return null
}

/** Full library gate — fingerprint, sourceUrl, topicKey, same-day title similarity. */
export async function findStoryLibraryMatch(
  db: Firestore,
  params: {
    title: string
    body?: string
    sourceUrl?: string
    rssFingerprint?: string
    citySlug?: string | null
    existingNewsId?: string | null
  }
): Promise<StoryLibraryMatch | null> {
  const quick = await findStoryLibraryMatchQuick(db, {
    rssFingerprint: params.rssFingerprint,
    sourceUrl: params.sourceUrl,
    existingNewsId: params.existingNewsId,
  })
  if (quick) return quick

  const topicKey = buildTopicKey(params.title, params.citySlug)
  const topicDoc = await db.collection(STORY_LIBRARY_COLLECTION).doc(libraryDocIdFromTopicKey(topicKey)).get()
  if (topicDoc.exists) {
    const firstNewsId = (topicDoc.data() as { firstNewsId?: string })?.firstNewsId?.trim()
    if (firstNewsId && isDifferentStory(params.existingNewsId, firstNewsId)) {
      return {
        libraryDocId: topicDoc.id,
        firstNewsId,
        reason: 'topicKey',
        matchMethod: 'topicKey',
      }
    }
  }

  const since = Date.now() - LIBRARY_LOOKBACK_MS
  const dateBucket = trDateBucket()
  const body = params.body ?? ''
  const titleTokens = tokenize(params.title)

  let snap: QuerySnapshot
  try {
    snap = await db
      .collection(STORY_LIBRARY_COLLECTION)
      .where('processedAt', '>=', since)
      .orderBy('processedAt', 'desc')
      .limit(LIBRARY_CANDIDATES)
      .get()
  } catch (err) {
    console.warn('[storyLibrary] processedAt query failed:', err)
    return null
  }

  let best: StoryLibraryMatch | null = null

  for (const doc of snap.docs) {
    const data = doc.data() as {
      firstNewsId?: string
      titleNorm?: string
      dateBucket?: string
      entityHints?: string[]
    }
    const firstNewsId = data.firstNewsId?.trim()
    if (!firstNewsId || !isDifferentStory(params.existingNewsId, firstNewsId)) continue

    // Same TR calendar day + strong title overlap
    if (data.dateBucket !== dateBucket) continue

    const candidateTitle = data.titleNorm ?? ''
    const similarity = computeArticleSimilarity(params.title, body, candidateTitle, '')

    if (similarity >= LIBRARY_SIMILARITY_THRESHOLD) {
      if (!best || (best.similarity ?? 0) < similarity) {
        best = {
          libraryDocId: doc.id,
          firstNewsId,
          reason: `titleSimilarity:${similarity.toFixed(2)}`,
          matchMethod: 'titleSimilarity',
          similarity,
        }
      }
      continue
    }

    // Shared distinctive entities + moderate title overlap
    const hints = Array.isArray(data.entityHints) ? data.entityHints : []
    if (hints.length >= 2 && titleTokens.size > 0) {
      const hintSet = new Set(hints.map((h) => h.toLowerCase()))
      let shared = 0
      for (const token of titleTokens) {
        if (hintSet.has(token)) shared += 1
      }
      const titleSim = jaccardSimilarity(titleTokens, tokenize(candidateTitle))
      if (shared >= 2 && titleSim >= 0.42) {
        const combined = Math.max(titleSim, shared / Math.max(hints.length, 1))
        if (!best || (best.similarity ?? 0) < combined) {
          best = {
            libraryDocId: doc.id,
            firstNewsId,
            reason: `entityOverlap:${shared}`,
            matchMethod: 'titleSimilarity',
            similarity: combined,
          }
        }
      }
    }
  }

  return best
}

export async function upsertStoryLibraryEntry(
  db: Firestore,
  params: StoryLibraryUpsertInput
): Promise<void> {
  const now = Date.now()
  const titleNorm = normalizeTitleNorm(params.title)
  const topicKey = buildTopicKey(params.title, params.citySlug)
  const docId = libraryDocIdFromTopicKey(topicKey)
  const ref = db.collection(STORY_LIBRARY_COLLECTION).doc(docId)
  const existing = await ref.get()
  const prev = existing.data() as {
    firstNewsId?: string
    firstSourceUrl?: string
    sourceUrls?: string[]
    rssFingerprints?: string[]
  } | undefined

  const sourceUrls = new Set<string>(prev?.sourceUrls ?? [])
  if (params.sourceUrl?.trim()) sourceUrls.add(params.sourceUrl.trim())

  const rssFingerprints = new Set<string>(prev?.rssFingerprints ?? [])
  if (params.rssFingerprint?.trim()) rssFingerprints.add(params.rssFingerprint.trim())

  await ref.set(
    {
      topicKey,
      titleNorm,
      entityHints: extractEntityHints(params.title),
      citySlug: params.citySlug?.trim().toLowerCase() || null,
      dateBucket: trDateBucket(now),
      firstNewsId: prev?.firstNewsId ?? params.newsId,
      firstSourceUrl: prev?.firstSourceUrl ?? params.sourceUrl,
      processedAt: now,
      editorId: params.editorId ?? null,
      sourceUrls: [...sourceUrls],
      rssFingerprints: [...rssFingerprints],
      lastNewsId: params.newsId,
      updatedAt: now,
    },
    { merge: true }
  )
}

/** Minimal newsDrafts audit stub — zero AI fields, tekrarlayan category. */
export async function createDuplicateNewsStub(
  db: Firestore,
  input: NewsroomArticleInput,
  hit: { existingNewsId: string; reason: string }
): Promise<string> {
  const now = Date.now()
  const ref = await db.collection(Collections.NEWS_DRAFTS).add({
    title: input.originalTitle,
    summary: (input.originalSummary ?? '').slice(0, 200),
    description: input.originalSummary ?? '',
    author: 'Sistem',
    authorId: 'system',
    thumbnail: input.imageUrl ?? '',
    videoUrl: '',
    category: 'Tekrarlayan Haber',
    categoryId: TEKRARLAYAN_CATEGORY_ID,
    city: '',
    district: '',
    citySlug: '',
    country: 'Türkiye',
    location: null,
    tags: ['tekrarlayan'],
    type: 'news',
    source: input.sourceLabel,
    draftStatus: 'rejected',
    aiGenerated: false,
    rssFingerprint: input.rssFingerprint ?? '',
    rssGuid: input.rssGuid ?? input.sourceUrl ?? '',
    sourceUrl: input.sourceUrl,
    ingestionSourceId: input.ingestionSourceId ?? input.editorId,
    sourceLabel: input.sourceLabel,
    originalTitle: input.originalTitle,
    ingestedAt: now,
    sourcePublishedAt: input.sourcePublishedAt ?? null,
    createdAt: now,
    updatedAt: now,
    editorId: input.editorId,
    editorType: input.editorType,
    isDuplicate: true,
    duplicateOf: hit.existingNewsId,
    duplicateReason: hit.reason,
    needsAdminReview: false,
    pipelineSkipped: true,
  })
  return ref.id
}

export async function recordStoryInLibrary(
  db: Firestore,
  input: NewsroomArticleInput,
  result: { newsId?: string; title?: string; citySlug?: string | null }
): Promise<void> {
  if (!result.newsId) return
  try {
    await upsertStoryLibraryEntry(db, {
      title: result.title ?? input.originalTitle,
      newsId: result.newsId,
      sourceUrl: input.sourceUrl,
      rssFingerprint: input.rssFingerprint,
      editorId: input.editorId,
      citySlug: result.citySlug ?? input.forcedCitySlug ?? null,
    })
  } catch (err) {
    console.warn('[storyLibrary] upsert failed:', err)
  }
}
