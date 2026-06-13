/**
 * NaHaber Multi-Agent AI Pipeline
 *
 * Akış: DeepSeek (Collector) → Gemini (Editor) → GPT (QA) → Firestore
 *
 * - DeepSeek: duplicate tespiti + içerik zenginleştirme
 * - Gemini: profesyonel haber yazımı + SEO + sosyal medya
 * - GPT: son kalite kontrolü + onay/red
 * - Onaylanan haberler news koleksiyonuna kaydedilir
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import { deepseekCollect, isDeepSeekConfigured } from './deepseek'
import { geminiEditArticle, isGeminiConfigured } from './gemini'
import { gptQaCheck, gptQaFallback, isGptConfigured } from './gpt'
import type {
  AiQueueItem,
  AiQueueStatus,
  AiLogEntry,
  PipelineResult,
  AiCronRunResult,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────
const DUPLICATE_THRESHOLD = 80      // duplicateScore >= 80 → skip
const MIN_QUALITY_THRESHOLD = 40    // qualityScore < 40 → reject after Gemini
const BATCH_SIZE = 5                // items per cron run
const INTER_ITEM_DELAY_MS = 1500    // rate limit pause between items

// ── Logging ───────────────────────────────────────────────────────────────────
async function log(entry: Omit<AiLogEntry, 'timestamp'>): Promise<void> {
  try {
    const db = getAdminFirestore()
    await db.collection(Collections.AI_LOGS).add({
      ...entry,
      timestamp: Date.now(),
    })
  } catch {
    // Non-critical — don't let logging errors break the pipeline
  }
}

// ── Queue helpers ─────────────────────────────────────────────────────────────
async function updateQueueItem(
  id: string,
  update: Partial<AiQueueItem>
): Promise<void> {
  const db = getAdminFirestore()
  await db.collection(Collections.AI_QUEUE).doc(id).update({
    ...update,
    updatedAt: Date.now(),
  })
}

// ── Slug generator ─────────────────────────────────────────────────────────────
function generateSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '')
  return `${base}-${id.slice(-6)}`
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function runPipelineForItem(item: AiQueueItem): Promise<PipelineResult> {
  const startTime = Date.now()
  const itemId = item.id

  await updateQueueItem(itemId, { status: 'processing' as AiQueueStatus })
  await log({ level: 'info', agent: 'pipeline', message: `[${itemId}] Pipeline başladı: "${item.originalTitle}"`, queueItemId: itemId })

  // ── Stage 1: DeepSeek ────────────────────────────────────────────────────
  let enrichedContent = item.originalContent
  let isDuplicate = false

  if (isDeepSeekConfigured()) {
    try {
      // Get recent titles for duplicate detection
      const db = getAdminFirestore()
      const recentSnap = await db.collection(Collections.NEWS)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
      const recentTitles = recentSnap.docs.map((d) => (d.data() as { title?: string }).title ?? '')

      const deepseekResult = await deepseekCollect({
        sourceLabel: item.sourceLabel,
        originalTitle: item.originalTitle,
        originalSummary: item.originalSummary,
        originalContent: item.originalContent,
        sourceUrl: item.sourceUrl,
        recentTitles,
      })

      await updateQueueItem(itemId, { deepseekResult })

      if (deepseekResult.isDuplicate && deepseekResult.duplicateScore >= DUPLICATE_THRESHOLD) {
        await updateQueueItem(itemId, { status: 'rejected' as AiQueueStatus })
        await log({ level: 'info', agent: 'deepseek', message: `[${itemId}] Duplicate tespit edildi (skor: ${deepseekResult.duplicateScore})`, queueItemId: itemId })
        return { queueItemId: itemId, success: false, stage: 'deepseek', decision: 'rejected', error: 'Duplicate', durationMs: Date.now() - startTime }
      }

      enrichedContent = deepseekResult.enrichedContent || item.originalContent
      await log({ level: 'info', agent: 'deepseek', message: `[${itemId}] DeepSeek tamamlandı (kalite: ${deepseekResult.qualityScore})`, queueItemId: itemId })
    } catch (err) {
      await log({ level: 'warn', agent: 'deepseek', message: `[${itemId}] DeepSeek başarısız, atlanıyor: ${String(err)}`, queueItemId: itemId })
      // Continue without DeepSeek
    }
  }

  // ── Stage 2: Gemini ────────────────────────────────────────────────────────
  if (!isGeminiConfigured()) {
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: ['GEMINI_API_KEY eksik'] })
    return { queueItemId: itemId, success: false, stage: 'gemini', error: 'GEMINI_API_KEY eksik', durationMs: Date.now() - startTime }
  }

  let geminiResult
  try {
    geminiResult = await geminiEditArticle({
      sourceLabel: item.sourceLabel,
      originalTitle: item.originalTitle,
      originalSummary: item.originalSummary,
      originalContent: item.originalContent,
      sourceUrl: item.sourceUrl,
      enrichedContent,
      forcedCategoryId: item.forcedCategoryId,
    })

    await updateQueueItem(itemId, { geminiResult })

    if (geminiResult.qualityScore < MIN_QUALITY_THRESHOLD) {
      await updateQueueItem(itemId, { status: 'rejected' as AiQueueStatus })
      return { queueItemId: itemId, success: false, stage: 'gemini', decision: 'rejected', error: `Düşük kalite skoru: ${geminiResult.qualityScore}`, durationMs: Date.now() - startTime }
    }

    await log({ level: 'info', agent: 'gemini', message: `[${itemId}] Gemini tamamlandı (kalite: ${geminiResult.qualityScore}, SEO: ${geminiResult.seoScore})`, queueItemId: itemId })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: [errMsg] })
    await log({ level: 'error', agent: 'gemini', message: `[${itemId}] Gemini hatası: ${errMsg}`, queueItemId: itemId })
    return { queueItemId: itemId, success: false, stage: 'gemini', error: errMsg, durationMs: Date.now() - startTime }
  }

  // ── Stage 3: GPT QA ────────────────────────────────────────────────────────
  let gptResult
  try {
    if (isGptConfigured()) {
      gptResult = await gptQaCheck(geminiResult)
    } else {
      gptResult = gptQaFallback(geminiResult)
      await log({ level: 'warn', agent: 'gpt', message: `[${itemId}] GPT yapılandırılmamış, fallback QA kullanıldı`, queueItemId: itemId })
    }

    await updateQueueItem(itemId, { gptResult })
    await log({ level: 'info', agent: 'gpt', message: `[${itemId}] GPT QA: ${gptResult.decision} (skor: ${gptResult.score})`, queueItemId: itemId })
  } catch (err) {
    // GPT failure is non-fatal — use fallback
    gptResult = gptQaFallback(geminiResult)
    await log({ level: 'warn', agent: 'gpt', message: `[${itemId}] GPT QA hatası, fallback: ${String(err)}`, queueItemId: itemId })
  }

  if (gptResult.decision === 'rejected') {
    await updateQueueItem(itemId, { status: 'rejected' as AiQueueStatus })
    return { queueItemId: itemId, success: false, stage: 'gpt', decision: 'rejected', error: gptResult.issues.join('; '), durationMs: Date.now() - startTime }
  }

  // ── Stage 4: Publish to Firestore ─────────────────────────────────────────
  try {
    const db = getAdminFirestore()
    const newsRef = db.collection(Collections.NEWS).doc()
    const newsId = newsRef.id

    // Apply GPT revisions if provided
    const finalTitle = gptResult.revisedTitle || geminiResult.title
    const finalDescription = gptResult.revisedDescription || geminiResult.description

    const slug = geminiResult.slug || generateSlug(finalTitle, newsId)

    await newsRef.set({
      // Core
      title: finalTitle,
      shortTitle: geminiResult.shortTitle,
      slug,
      description: finalDescription,
      summary: geminiResult.summary,
      spot: geminiResult.spot,
      content: geminiResult.content,

      // Classification
      category: geminiResult.category,
      subCategory: geminiResult.subCategory || null,
      newsType: geminiResult.newsType,
      sentiment: geminiResult.sentiment,

      // Geo
      location: geminiResult.location || null,
      city: geminiResult.location || null,
      country: geminiResult.country,
      language: 'tr',

      // Taxonomy
      tags: geminiResult.tags,
      keywords: geminiResult.keywords,
      relatedTopics: geminiResult.relatedTopics,

      // SEO
      metaTitle: geminiResult.metaTitle,
      metaDescription: geminiResult.metaDescription,
      seoScore: geminiResult.seoScore,
      canonical: `https://nahaber.com/haber/${slug}`,

      // Media
      imageUrl: item.imageUrl || null,
      coverImageUrl: item.imageUrl || null,

      // Scores
      qualityScore: geminiResult.qualityScore,
      factCheckScore: geminiResult.factCheckScore,
      readingTime: geminiResult.readingTime,
      aiConfidence: geminiResult.aiConfidence,
      gptScore: gptResult.score,

      // Flags
      breakingNews: geminiResult.breakingNews,
      featured: geminiResult.featured,
      isBreaking: geminiResult.isBreaking,
      published: true,
      aiGenerated: true,

      // Social
      socialCaption: geminiResult.socialCaption,
      twitterText: geminiResult.twitterText,
      facebookText: geminiResult.facebookText,
      instagramCaption: geminiResult.instagramCaption,

      // Push
      pushTitle: gptResult.pushTitle,
      pushBody: gptResult.pushBody,

      // Source
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      rssFingerprint: item.rssFingerprint || null,

      // Pipeline metadata
      aiPipeline: true,
      pipelineQueueId: itemId,
      aiEditor: 'multi-agent',
      geminiModel: geminiResult.modelUsed,
      gptModel: gptResult.modelUsed,

      // Timestamps
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
    })

    await updateQueueItem(itemId, {
      status: 'done' as AiQueueStatus,
      finalNewsId: newsId,
      processedAt: Date.now(),
    })

    await log({
      level: 'info', agent: 'pipeline',
      message: `[${itemId}] ✓ Yayınlandı: "${finalTitle}" → news/${newsId}`,
      queueItemId: itemId, newsId,
      durationMs: Date.now() - startTime,
    })

    return {
      queueItemId: itemId,
      success: true,
      newsId,
      stage: 'publish',
      decision: gptResult.decision,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: [errMsg] })
    await log({ level: 'error', agent: 'pipeline', message: `[${itemId}] Yayın hatası: ${errMsg}`, queueItemId: itemId })
    return { queueItemId: itemId, success: false, stage: 'publish', error: errMsg, durationMs: Date.now() - startTime }
  }
}

// ── Cron batch processor ───────────────────────────────────────────────────────
export async function processPipelineQueue(): Promise<AiCronRunResult> {
  const db = getAdminFirestore()
  const startTime = Date.now()

  // Fetch pending items — gracefully handle Firestore errors (e.g. RESOURCE_EXHAUSTED, missing index)
  let snap: FirebaseFirestore.QuerySnapshot
  try {
    snap = await db.collection(Collections.AI_QUEUE)
      .where('status', '==', 'pending')
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .limit(BATCH_SIZE)
      .get()
  } catch (fsErr) {
    const code = (fsErr as { code?: number }).code
    console.warn(`[ai-pipeline] Firestore query failed${code === 8 ? ' (RESOURCE_EXHAUSTED)' : ''}:`, fsErr instanceof Error ? fsErr.message : fsErr)
    return { processed: 0, published: 0, rejected: 0, failed: 0, durationMs: Date.now() - startTime, items: [] }
  }

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AiQueueItem))

  const result: AiCronRunResult = {
    processed: items.length,
    published: 0,
    rejected: 0,
    failed: 0,
    durationMs: 0,
    items: [],
  }

  for (const item of items) {
    const pResult = await runPipelineForItem(item)

    if (pResult.success) result.published++
    else if (pResult.decision === 'rejected') result.rejected++
    else result.failed++

    result.items.push({
      queueItemId: item.id,
      title: item.originalTitle,
      decision: pResult.success ? (pResult.decision ?? 'approved') : (pResult.decision ?? 'error'),
      newsId: pResult.newsId,
    })

    // Rate limit pause between items
    if (items.indexOf(item) < items.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_ITEM_DELAY_MS))
    }
  }

  result.durationMs = Date.now() - startTime
  return result
}

// ── Queue item creator (for external use) ─────────────────────────────────────
export async function addToAiQueue(input: Omit<AiQueueItem, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'retryCount'>): Promise<string> {
  const db = getAdminFirestore()
  const ref = await db.collection(Collections.AI_QUEUE).add({
    ...input,
    status: 'pending' as AiQueueStatus,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    retryCount: 0,
  })
  return ref.id
}
