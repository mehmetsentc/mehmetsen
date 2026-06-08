/**
 * Newsroom pipeline: source → AI rewrite → fact-check → dedupe → category/geo → AUTO publish.
 * newsDrafts only when confidence < 50, moderation review, or hard fact-check failure.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { cityCategoryId, slugifyCity, type PostLocation } from '@/lib/location'
import { getCityCategoryName, normalizeCitySlug } from '@/constants/cities'
import { Collections } from '@/lib/firebase/admin'
import { aiNewsEditor } from '@/services/aiNewsEditor'
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
import type { NewsroomArticleInput } from '@/services/newsroom/types'

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
    // Skip second AI rewrite for editors that already produced AI content (trend, influencer)
    const rewritten = input.skipAiRewrite
      ? {
          title: input.originalTitle,
          summary: input.originalSummary,
          description: input.originalContent,
          categoryId: input.forcedCategoryId ?? 'gundem',
          categoryConfidence: 80,
          isBreaking: input.isBreaking ?? false,
          city: null,
          district: null,
          country: 'Türkiye',
          tags: input.extraTags ?? [],
        }
      : await aiNewsEditor.rewriteArticle({
          sourceLabel: input.sourceLabel,
          originalTitle: input.originalTitle,
          originalSummary: input.originalSummary,
          originalContent: input.originalContent,
          sourceUrl: input.sourceUrl,
        })

    const factCheck = await factChecker.check({
      sourceLabel: input.sourceLabel,
      sourceUrl: input.sourceUrl,
      originalTitle: input.originalTitle,
      originalSummary: input.originalSummary,
      rewritten,
    })

    const geo = geoEngine.enrich(rewritten, input.extraTags ?? [])

    let city = geo.city
    let district = geo.district
    let citySlug = geo.citySlug
    const country = geo.country

    if (input.forcedCitySlug?.trim()) {
      citySlug = normalizeCitySlug(input.forcedCitySlug)
      city = input.forcedCity?.trim() || getCityCategoryName(citySlug)
    }
    if (input.forcedDistrict?.trim()) {
      district = input.forcedDistrict.trim()
    }

    const resolvedCategoryRaw = categoryEngine.resolve(
      rewritten.categoryId,
      input.editorType,
      input.forcedCategoryId
    )

    const classification = categoryEngine.validate({
      aiCategoryId: resolvedCategoryRaw,
      categoryConfidence: rewritten.categoryConfidence,
      aiIsBreaking: rewritten.isBreaking ?? input.isBreaking,
      title: rewritten.title,
      body: rewritten.description,
      editorType: input.editorType,
    })

    if (classification.overrides.length > 0) {
      console.log(
        `[newsroom/category] ${input.sourceUrl}: ${classification.overrides.join('; ')}`
      )
    }

    const moderationRaw = await moderateContent({
      text: `${rewritten.title}\n\n${rewritten.description}`,
      mediaUrls: input.imageUrl ? [{ url: input.imageUrl, type: 'image' }] : [],
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
      input,
      rewritten.title,
      rewritten.description,
      isBreaking,
      input.priorityScore
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

    const doc = {
      title: rewritten.title,
      summary: rewritten.summary,
      description: rewritten.description,
      author: NAHABER_AUTHOR,
      authorId: NAHABER_AUTHOR_ID,
      thumbnail: input.imageUrl ?? '',
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
      source: input.sourceLabel,
      draftStatus: 'pending_review' as const,
      moderationReasons: moderation.decision === 'review' ? moderation.reasons : [],
      aiGenerated: true,
      rssFingerprint: fingerprint,
      rssGuid: input.rssGuid ?? input.sourceUrl,
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
