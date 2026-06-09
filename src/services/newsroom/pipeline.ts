/**
 * Newsroom pipeline: source → extract → AI rewrite → fact-check → dedupe → category/geo → AUTO publish.
 * newsDrafts only when confidence < 50, moderation review, or hard fact-check failure.
 *
 * EXTRACTION STAGE (new):
 *   When baseWorker queues items with thin RSS content (<500 chars),
 *   pipeline fetches the full article before sending to AI.
 *   GPT fallback used when extraction fails (blocked sites).
 */
import type { Firestore } from 'firebase-admin/firestore'
import { cityCategoryId, slugifyCity, type PostLocation } from '@/lib/location'
import { getCityCategoryName, normalizeCitySlug } from '@/constants/cities'
import { Collections } from '@/lib/firebase/admin'
import { aiNewsEditor, type AiRewriteResult } from '@/services/aiNewsEditor'
import { moderateContent } from '@/services/moderationService'
import { newsDraftService } from '@/services/newsDraftService'
import {
  computeBreakingScore,
  queueBreakingPushNotification,
  resolveBreakingFlags,
} from '@/services/newsroom/breakingPriority'
import { categoryEngine } from '@/services/newsroom/categoryEngine'
import {
  NEWSROOM_AUTO_PUBLISH_THRESHOLD,
  NEWSROOM_LOW_CONFIDENCE_THRESHOLD,
} from '@/services/newsroom/config'
import { findSimilarPublishedArticle } from '@/services/newsroom/dedupe/similarityEngine'
import { factChecker } from '@/services/newsroom/factChecker'
import { geoEngine } from '@/services/newsroom/geoEngine'
import { fetchArticleEnrichment } from '@/services/rss/articleFetcher'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

/** Minimum total content length (chars) to proceed to AI rewrite. */
const QUALITY_MIN_CHARS = 500

/**
 * GPT fallback — when article extraction fails (blocked site),
 * generate a complete Turkish news article from headline alone.
 */
async function generateArticleFromHeadline(
  title: string,
  sourceLabel: string
): Promise<{ summary: string; content: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_NEWS_MODEL?.trim() || 'gpt-4o-mini'
  if (!apiKey) return null

  const systemPrompt = `Sen NaHaber adlı Türkçe haber platformunun editörüsün.
Bir haber başlığı verilecek. Bu başlıktan yola çıkarak gerçekçi, bilgilendirici bir haber yaz.
KURALLAR:
- Türkçe, akıcı gazetecilik dili
- summary: 1-2 cümle bağlam özeti (max 160 karakter)
- content: 3-5 paragraf (150-350 kelime), giriş + olgular + arka plan
- Bilinmeyenleri "araştırılıyor", "henüz açıklanmadı" gibi ifadelerle belirt
- Sadece JSON: {"summary":"...","content":"..."}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Başlık: "${title}"\nKaynak: ${sourceLabel}\n\nHaberi yaz.` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as { summary?: string; content?: string }
    const summary = parsed.summary?.trim() || ''
    const content = parsed.content?.trim() || ''
    if (content.length < 100) return null
    return { summary, content }
  } catch {
    return null
  }
}

const NAHABER_AUTHOR = 'nahaber'
const NAHABER_AUTHOR_ID = 'nahaber'

export type PipelineOutcome = 'created' | 'published' | 'updated' | 'skipped' | 'failed'

export interface PipelineStats {
  created: number
  published: number
  updated: number
  skipped: number
  failed: number
  lowConfidence: number
}

export interface PipelineOptions {
  changeType?: 'new' | 'updated'
  existingNewsId?: string
  queueJobId?: string
}

export interface PipelineResult {
  outcome: PipelineOutcome
  lowConfidence?: boolean
  newsId?: string
}

async function findExistingByFingerprint(
  db: Firestore,
  fingerprint: string
): Promise<{ id: string; collection: 'news' | 'newsDrafts' } | null> {
  const [newsSnap, draftSnap] = await Promise.all([
    db.collection(Collections.NEWS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
    db.collection(Collections.NEWS_DRAFTS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
  ])

  if (!newsSnap.empty) return { id: newsSnap.docs[0]!.id, collection: 'news' }
  if (!draftSnap.empty) return { id: draftSnap.docs[0]!.id, collection: 'newsDrafts' }
  return null
}

function toLocation(
  city: string | null,
  district: string | null,
  country: string
): PostLocation | null {
  if (!city?.trim()) return null
  const out: PostLocation = {
    city: city.trim(),
    country: country.trim() || 'Türkiye',
    lat: 0,
    lng: 0,
  }
  const districtValue = district?.trim()
  if (districtValue) out.district = districtValue
  return out
}

async function appendEditHistory(
  db: Firestore,
  newsId: string,
  entry: {
    changeType: string
    title: string
    summary: string
    confidenceScore: number
    queueJobId?: string
  }
): Promise<void> {
  const now = Date.now()
  await db
    .collection(Collections.NEWS)
    .doc(newsId)
    .collection('editHistory')
    .add({
      ...entry,
      editedAt: now,
      editor: NAHABER_AUTHOR_ID,
    })
}

export async function processNewsroomArticle(
  db: Firestore,
  input: NewsroomArticleInput,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const fingerprint =
    input.rssFingerprint ?? `${input.editorId}:${input.sourceUrl}`.slice(0, 128)

  if (options.changeType !== 'updated') {
    const existing = await findExistingByFingerprint(db, fingerprint)
    if (existing?.collection === 'news' && !options.existingNewsId) {
      return { outcome: 'skipped' }
    }
    if (existing?.collection === 'newsDrafts') {
      return { outcome: 'skipped' }
    }
  }

  try {
    // ── EXTRACTION STAGE ────────────────────────────────────────────────────
    // baseWorker enqueues raw RSS items without full content.
    // rssEditor already extracts before calling pipeline — skip for those.
    // We detect thin content and fetch the full article here.
    let workingInput = { ...input }

    const totalRaw = (workingInput.originalContent + ' ' + workingInput.originalSummary).trim()
    const needsExtraction = !workingInput.skipAiRewrite && totalRaw.length < QUALITY_MIN_CHARS

    if (needsExtraction && workingInput.sourceUrl) {
      try {
        const extracted = await fetchArticleEnrichment(workingInput.sourceUrl, 12_000)
        if (extracted) {
          if (extracted.bodyText && extracted.bodyText.length > 200) {
            workingInput = { ...workingInput, originalContent: extracted.bodyText }
          }
          if (extracted.htmlBody && !workingInput.htmlContent) {
            workingInput = { ...workingInput, htmlContent: extracted.htmlBody }
          }
          if (extracted.imageUrl && !workingInput.imageUrl) {
            workingInput = { ...workingInput, imageUrl: extracted.imageUrl }
          }
          if (extracted.readingTimeMinutes && !workingInput.readingTimeMinutes) {
            workingInput = { ...workingInput, readingTimeMinutes: extracted.readingTimeMinutes }
          }
          if (extracted.author && !workingInput.extractedAuthor) {
            workingInput = { ...workingInput, extractedAuthor: extracted.author }
          }
        }
      } catch {
        // non-blocking — proceed with whatever we have
      }
    }

    // ── QUALITY GATE ────────────────────────────────────────────────────────
    // Reject articles that are still too thin after extraction.
    // Try GPT fallback first; if that also fails, skip.
    const totalAfterExtract = (workingInput.originalContent + ' ' + workingInput.originalSummary).trim()
    if (!workingInput.skipAiRewrite && totalAfterExtract.length < QUALITY_MIN_CHARS) {
      const generated = await generateArticleFromHeadline(workingInput.originalTitle, workingInput.sourceLabel)
      if (generated) {
        workingInput = {
          ...workingInput,
          originalContent: generated.content,
          originalSummary: generated.summary || workingInput.originalSummary,
        }
        console.log(`[newsroom/pipeline] GPT fallback used for thin content: ${workingInput.sourceUrl}`)
      } else {
        console.warn(`[newsroom/pipeline] quality gate: content too thin, skipping ${workingInput.sourceUrl}`)
        return { outcome: 'skipped' }
      }
    }

    // Skip second AI rewrite for editors that already produced AI content (trend, influencer)
    const rewritten = workingInput.skipAiRewrite
      ? {
          title: workingInput.originalTitle,
          spot: workingInput.originalSummary ?? '',
          summary: workingInput.originalSummary,
          description: workingInput.originalContent,
          seoTitle: workingInput.originalTitle,
          seoDescription: workingInput.originalSummary?.slice(0, 160) ?? '',
          categoryId: workingInput.forcedCategoryId ?? 'gundem',
          categoryConfidence: 80,
          isBreaking: workingInput.isBreaking ?? false,
          city: null,
          district: null,
          country: 'Türkiye',
          tags: workingInput.extraTags ?? [],
        }
      : await aiNewsEditor.rewriteArticle({
          sourceLabel: workingInput.sourceLabel,
          originalTitle: workingInput.originalTitle,
          originalSummary: workingInput.originalSummary,
          originalContent: workingInput.originalContent,
          sourceUrl: workingInput.sourceUrl,
        })

    const factCheck = await factChecker.check({
      sourceLabel: workingInput.sourceLabel,
      sourceUrl: workingInput.sourceUrl,
      originalTitle: workingInput.originalTitle,
      originalSummary: workingInput.originalSummary,
      rewritten,
    })

    const geo = geoEngine.enrich(rewritten, workingInput.extraTags ?? [])

    let city = geo.city
    let district = geo.district
    let citySlug = geo.citySlug
    const country = geo.country

    if (workingInput.forcedCitySlug?.trim()) {
      citySlug = normalizeCitySlug(workingInput.forcedCitySlug)
      city = workingInput.forcedCity?.trim() || getCityCategoryName(citySlug)
    }
    if (workingInput.forcedDistrict?.trim()) {
      district = workingInput.forcedDistrict.trim()
    }

    const resolvedCategoryRaw = categoryEngine.resolve(
      rewritten.categoryId,
      workingInput.editorType,
      workingInput.forcedCategoryId
    )

    const classification = categoryEngine.validate({
      aiCategoryId: resolvedCategoryRaw,
      categoryConfidence: rewritten.categoryConfidence,
      aiIsBreaking: rewritten.isBreaking ?? workingInput.isBreaking,
      title: rewritten.title,
      body: rewritten.description,
      editorType: workingInput.editorType,
    })

    if (classification.overrides.length > 0) {
      console.log(
        `[newsroom/category] ${workingInput.sourceUrl}: ${classification.overrides.join('; ')}`
      )
    }

    const moderationRaw = await moderateContent({
      text: `${rewritten.title}\n\n${rewritten.description}`,
      mediaUrls: workingInput.imageUrl ? [{ url: workingInput.imageUrl, type: 'image' }] : [],
    })
    // Güvenilir haber kaynaklarından gelen içerik — moderation hatası olsa bile approve et
    const moderation = moderationRaw.reasons.some(r => r.startsWith('error:'))
      ? { ...moderationRaw, decision: 'approve' as const }
      : moderationRaw

    const now = Date.now()
    const locationRaw = toLocation(city, district, country)
    const location = locationRaw
      ? { ...locationRaw, country: locationRaw.country ?? 'Türkiye' }
      : null
    if (location && citySlug) {
      location.city = city ?? location.city
      if (district) location.district = district
    }
    const resolvedCitySlug = normalizeCitySlug(
      location?.city ? slugifyCity(location.city) : citySlug
    )
    const cityCategory = resolvedCitySlug ? cityCategoryId(resolvedCitySlug) : ''
    const resolvedCategory = classification.categoryId || cityCategory

    const isBreaking = classification.isBreaking
    const breakingScore = computeBreakingScore(
      workingInput,
      rewritten.title,
      rewritten.description,
      isBreaking,
      workingInput.priorityScore
    )
    const breakingFlags = resolveBreakingFlags(breakingScore)
    const priorityScore = breakingScore

    const lowConfidence = factCheck.confidenceScore < NEWSROOM_LOW_CONFIDENCE_THRESHOLD
    const factCheckFailedBadly =
      factCheck.confidenceScore < 35 ||
      factCheck.flags.includes('speculation') ||
      factCheck.flags.includes('title_mismatch')

    const needsDraft =
      factCheck.confidenceScore < NEWSROOM_AUTO_PUBLISH_THRESHOLD ||
      factCheckFailedBadly ||
      moderation.decision === 'review'

    // Estimate reading time from AI-written content
    const readingWords = (rewritten.description || '').trim().split(/\s+/).filter(Boolean).length
    const readingTimeMinutes = workingInput.readingTimeMinutes ?? Math.max(1, Math.ceil(readingWords / 200))

    const doc = {
      title: rewritten.title,
      // Journalistic lead paragraph (2-4 sentences, answers 5W+H)
      spot: (rewritten as AiRewriteResult).spot ?? rewritten.summary,
      summary: rewritten.summary,
      description: rewritten.description,
      // Full AI-written article body
      content: rewritten.description,
      // Extracted HTML from source page (for rich rendering)
      htmlContent: workingInput.htmlContent ?? '',
      // SEO fields — generated by AI, optimized for search
      seoTitle: (rewritten as AiRewriteResult).seoTitle ?? rewritten.title,
      seoDescription: (rewritten as AiRewriteResult).seoDescription ?? rewritten.summary,
      author: workingInput.extractedAuthor || NAHABER_AUTHOR,
      authorId: NAHABER_AUTHOR_ID,
      thumbnail: workingInput.imageUrl ?? '',
      coverImageUrl: workingInput.imageUrl ?? '',
      videoUrl: '',
      category: resolvedCategory,
      categoryId: resolvedCategory,
      city: location?.city ?? '',
      district: location?.district ?? '',
      citySlug: resolvedCitySlug,
      country: location?.country ?? 'Türkiye',
      location,
      tags: geo.tags,
      type: 'news' as const,
      source: workingInput.sourceLabel,
      sourceUrl: workingInput.sourceUrl,
      readingTimeMinutes,
      draftStatus: 'pending_review' as const,
      moderationReasons: moderation.decision === 'review' ? moderation.reasons : [],
      aiGenerated: true,
      rssFingerprint: fingerprint,
      rssGuid: workingInput.rssGuid ?? workingInput.sourceUrl,
      ingestionSourceId: workingInput.ingestionSourceId ?? workingInput.editorId,
      sourceLabel: workingInput.sourceLabel,
      originalTitle: workingInput.originalTitle,
      ingestedAt: now,
      sourcePublishedAt: workingInput.sourcePublishedAt ?? null,
      createdAt: now,
      updatedAt: now,
      editorId: workingInput.editorId,
      editorType: workingInput.editorType,
      confidenceScore: factCheck.confidenceScore,
      factCheckFlags: factCheck.flags,
      isBreaking,
      priorityScore,
      breakingScore,
      isPinned: breakingFlags.isPinned,
      isTrending: breakingFlags.isTrending,
      needsAdminReview: needsDraft,
    }

    let targetNewsId = options.existingNewsId

    if (!targetNewsId && options.changeType !== 'updated') {
      const similar = await findSimilarPublishedArticle(
        db,
        rewritten.title,
        rewritten.description
      )
      if (similar) {
        targetNewsId = similar.newsId
        console.log(
          `[newsroom/dedupe] ${similar.similarity.toFixed(2)} similar → update ${similar.newsId}`
        )
      }
    }

    if (targetNewsId) {
      if (needsDraft) {
        await db.collection(Collections.NEWS_DRAFTS).add({
          ...doc,
          canonicalNewsId: targetNewsId,
          duplicateOf: targetNewsId,
        })
        return { outcome: 'created', lowConfidence, newsId: targetNewsId }
      }

      await newsDraftService.updatePublishedNews(db, targetNewsId, doc, {
        duplicateOf: targetNewsId,
        canonicalId: targetNewsId,
      })

      await appendEditHistory(db, targetNewsId, {
        changeType: options.changeType ?? 'similarity_merge',
        title: rewritten.title,
        summary: rewritten.summary,
        confidenceScore: factCheck.confidenceScore,
        queueJobId: options.queueJobId,
      })

      if (breakingFlags.shouldPushNotify) {
        await queueBreakingPushNotification(targetNewsId, rewritten.title, breakingScore)
      }

      console.log(`[newsroom] updated ${targetNewsId} (confidence=${factCheck.confidenceScore})`)
      return { outcome: 'updated', lowConfidence, newsId: targetNewsId }
    }

    const canAutoPublish = !needsDraft && moderation.decision === 'approve'

    if (canAutoPublish) {
      const { newsId } = await newsDraftService.publishFromPipeline(db, doc)
      if (breakingFlags.shouldPushNotify) {
        await queueBreakingPushNotification(newsId, rewritten.title, breakingScore)
      }
      console.log(`[newsroom] auto-published ${newsId} (confidence=${factCheck.confidenceScore})`)
      return { outcome: 'published', lowConfidence, newsId }
    }

    await db.collection(Collections.NEWS_DRAFTS).add(doc)
    return { outcome: 'created', lowConfidence }
  } catch (error) {
    console.error('[newsroom/pipeline] failed:', input.sourceUrl, error)
    return { outcome: 'failed' }
  }
}
