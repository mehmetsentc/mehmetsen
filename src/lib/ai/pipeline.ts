/**
 * NaHaber Multi-Agent AI Pipeline
 *
 * Akış: DeepSeek (Collector + Editor + QA) → Firestore taslak/yayın → Sosyal
 *
 * - DeepSeek : duplicate tespiti, haber yazımı, SEO, kalite
 * - Gemini   : varsayılan kapalı (maliyet); yalnızca LIVE_RESEARCH / vision bayrakları
 * - Onay politikasına göre newsDrafts veya news koleksiyonuna yazılır
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { deepseekCollect, deepseekEditArticle, deepseekQaFallback, isDeepSeekConfigured } from './deepseek'
import { runChiefEditor, isChiefEditorConfigured } from './chiefEditor'
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
const BATCH_SIZE = 10               // items per cron run (was 5 → doubled for throughput)
const INTER_ITEM_DELAY_MS = 800     // rate limit pause between items (was 1500ms)

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

  // ── Stage 2: DeepSeek Editörü ─────────────────────────────────────────────
  if (!isDeepSeekConfigured()) {
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: ['DEEPSEEK_API_KEY eksik'] })
    return { queueItemId: itemId, success: false, stage: 'gemini', error: 'DEEPSEEK_API_KEY eksik', durationMs: Date.now() - startTime }
  }

  let geminiResult
  try {
    geminiResult = await deepseekEditArticle({
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

    await log({ level: 'info', agent: 'deepseek', message: `[${itemId}] DeepSeek Editör tamamlandı (kalite: ${geminiResult.qualityScore}, SEO: ${geminiResult.seoScore})`, queueItemId: itemId })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: [errMsg] })
    await log({ level: 'error', agent: 'deepseek', message: `[${itemId}] DeepSeek Editör hatası: ${errMsg}`, queueItemId: itemId })
    return { queueItemId: itemId, success: false, stage: 'gemini', error: errMsg, durationMs: Date.now() - startTime }
  }

  // ── Stage 3: GPT Genel Yayın Yönetmeni ───────────────────────────────────
  // Kategori doğrulama + web araması + nihai yayın kararı
  let chiefResult
  try {
    if (isChiefEditorConfigured()) {
      chiefResult = await runChiefEditor({
        ...geminiResult,
        originalTitle: item.originalTitle,
        sourceLabel: item.sourceLabel,
      })
      await log({
        level: 'info', agent: 'gpt',
        message: `[${itemId}] GYY: ${chiefResult.decision} (skor: ${chiefResult.overallScore}, kategori: ${chiefResult.finalCategory}${chiefResult.webSearchUsed ? ', web araması yapıldı' : ''})`,
        queueItemId: itemId,
      })
    } else {
      chiefResult = deepseekQaFallback(geminiResult)
      await log({ level: 'warn', agent: 'deepseek', message: `[${itemId}] DEEPSEEK_API_KEY yok, GYY fallback kullanıldı`, queueItemId: itemId })
    }
  } catch (err) {
    chiefResult = deepseekQaFallback(geminiResult)
    await log({ level: 'warn', agent: 'deepseek', message: `[${itemId}] GYY hatası, fallback: ${String(err)}`, queueItemId: itemId })
  }

  if (chiefResult.decision === 'rejected' || chiefResult.decision === 'needs_revision') {
    await updateQueueItem(itemId, { status: 'rejected' as AiQueueStatus })
    return { queueItemId: itemId, success: false, stage: 'gpt', decision: chiefResult.decision, error: chiefResult.issues.join('; '), durationMs: Date.now() - startTime }
  }

  // ── Stage 4: Draft only (no direct auto-publish) ──────────────────────────
  // P0: aiQueue must not bypass newsroom moderation/gates. Write structured
  // bodyBlocks into newsDrafts for CMS review.
  try {
    const db = getAdminFirestore()
    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc()
    const draftId = draftRef.id
    const now = Date.now()

    const finalTitle = chiefResult.finalTitle || geminiResult.title
    const finalDescription = chiefResult.finalDescription || geminiResult.description
    const finalCategory = chiefResult.finalCategory || geminiResult.category
    const finalTags = chiefResult.finalTags.length > 0 ? chiefResult.finalTags : geminiResult.tags
    const finalSummary = chiefResult.finalSummary || geminiResult.summary
    const spot = geminiResult.spot || finalSummary
    const slug = geminiResult.slug || generateSlug(finalTitle, draftId)

    const bodyBlocks = buildBodyBlocksFromAi({
      title: finalTitle,
      spot,
      summary: finalSummary,
      content: finalDescription,
      imageUrl: item.imageUrl || undefined,
      imageCaption: finalTitle,
    })
    const plainFromBlocks = articleBlocksToPlainText(bodyBlocks)
    const contentBody = plainFromBlocks || finalDescription

    await draftRef.set({
      title: finalTitle,
      shortTitle: geminiResult.shortTitle,
      slug,
      description: contentBody,
      summary: finalSummary,
      spot,
      content: contentBody,
      bodyBlocks,
      htmlContent: '',
      articleLayout: bodyBlocks.some((b) => b.type === 'heading') ? 'longform' : 'standard',

      category: finalCategory,
      categoryId: finalCategory,
      subCategory: geminiResult.subCategory || null,
      newsType: geminiResult.newsType,
      sentiment: geminiResult.sentiment,
      categoryConfidence: chiefResult.categoryConfidence,
      categoryReason: chiefResult.categoryReason || null,

      location: geminiResult.location || null,
      city: geminiResult.location || null,
      country: geminiResult.country,
      language: 'tr',

      tags: finalTags,
      keywords: geminiResult.keywords,
      relatedTopics: geminiResult.relatedTopics,

      metaTitle: geminiResult.metaTitle,
      metaDescription: geminiResult.metaDescription,
      seoScore: geminiResult.seoScore,
      seoTitle: geminiResult.metaTitle || finalTitle,
      seoDescription: geminiResult.metaDescription || finalSummary,

      imageUrl: item.imageUrl || null,
      coverImageUrl: item.imageUrl || null,
      thumbnail: item.imageUrl || '',

      qualityScore: chiefResult.contentQuality || geminiResult.qualityScore,
      factCheckScore: geminiResult.factCheckScore,
      readingTime: geminiResult.readingTime,
      aiConfidence: chiefResult.overallScore,
      chiefEditorScore: chiefResult.overallScore,
      confidenceScore: chiefResult.overallScore,

      breakingNews: geminiResult.breakingNews,
      // Never auto-pin homepage Öne Çıkan — editor toggle (+ featuredAt) only
      featured: false,
      isEditorPick: false,
      aiSuggestedFeatured: geminiResult.featured === true,
      isBreaking: geminiResult.isBreaking,
      aiGenerated: true,
      draftStatus: 'pending_review',
      moderationReasons: [
        'ai_queue_requires_cms_review',
        ...(chiefResult.issues ?? []),
      ],

      webSearchUsed: chiefResult.webSearchUsed,
      webSearchQueries: chiefResult.searchQueries.length > 0 ? chiefResult.searchQueries : null,

      socialCaption: geminiResult.socialCaption,
      twitterText: geminiResult.twitterText,
      facebookText: geminiResult.facebookText,
      instagramCaption: geminiResult.instagramCaption,
      pushTitle: chiefResult.pushTitle,
      pushBody: chiefResult.pushBody,

      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      source: item.sourceLabel,
      rssFingerprint: item.rssFingerprint || null,
      originalTitle: item.originalTitle,

      aiPipeline: true,
      pipelineQueueId: itemId,
      aiEditor: 'deepseek-only-v3',
      deepseekModel: geminiResult.modelUsed,
      chiefEditorModel: chiefResult.modelUsed,

      type: 'news',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      ingestedAt: now,
    })

    await updateQueueItem(itemId, {
      status: 'done' as AiQueueStatus,
      finalNewsId: draftId,
      processedAt: Date.now(),
    })

    await log({
      level: 'info', agent: 'pipeline',
      message: `[${itemId}] ✓ Draft kaydedildi (CMS inceleme): "${finalTitle}" → newsDrafts/${draftId}`,
      queueItemId: itemId, newsId: draftId,
      durationMs: Date.now() - startTime,
    })

    return {
      queueItemId: itemId,
      success: true,
      newsId: draftId,
      stage: 'publish',
      decision: 'needs_revision',
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateQueueItem(itemId, { status: 'failed' as AiQueueStatus, errorLog: [errMsg] })
    await log({ level: 'error', agent: 'pipeline', message: `[${itemId}] Draft kayıt hatası: ${errMsg}`, queueItemId: itemId })
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

    // Stage 4 writes newsDrafts only — never count CMS-review drafts as live publishes.
    if (pResult.success && pResult.decision === 'approved') result.published++
    else if (pResult.decision === 'rejected' || pResult.decision === 'needs_revision') result.rejected++
    else if (!pResult.success) result.failed++
    else result.rejected++

    result.items.push({
      queueItemId: item.id,
      title: item.originalTitle,
      decision: pResult.success ? (pResult.decision ?? 'needs_revision') : (pResult.decision ?? 'error'),
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
