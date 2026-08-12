import type { Firestore } from 'firebase-admin/firestore'
import { revalidatePath } from 'next/cache'
import { isYerelCategoryTree } from '@/constants/config'
import { Collections } from '@/lib/firebase/collections'
import { buildNewsSlug } from '@/lib/newsSlug'
import { normalizePublishedLocalCategory } from '@/lib/news/nationalLocalCategoryRouting'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'
import { notifyPublishedArticle } from '@/lib/indexNow'
import { recordStoryInLibrary } from '@/services/newsroom/dedupe/storyLibraryService'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export interface ManualQueueEditFields {
  title?: string
  summary?: string
  content?: string
  imageUrl?: string
  categoryId?: string
  city?: string
  citySlug?: string
  district?: string
  source?: string
  tags?: string[]
  isBreaking?: boolean
}

export interface QueueEditorPayload extends ManualQueueEditFields {
  sourceUrl?: string
  workerId?: string
  status?: string
  createdAt?: number
}

export function mergeQueueEditFields(
  input: NewsroomArticleInput,
  edits: ManualQueueEditFields
): NewsroomArticleInput {
  const next: NewsroomArticleInput = { ...input }

  if (edits.title !== undefined) next.originalTitle = edits.title.trim()
  if (edits.summary !== undefined) next.originalSummary = edits.summary.trim()
  if (edits.content !== undefined) next.originalContent = edits.content.trim()
  if (edits.imageUrl !== undefined) next.imageUrl = edits.imageUrl.trim()
  if (edits.categoryId !== undefined) next.forcedCategoryId = edits.categoryId.trim()
  if (edits.city !== undefined) next.forcedCity = edits.city.trim()
  if (edits.citySlug !== undefined) next.forcedCitySlug = edits.citySlug.trim()
  if (edits.district !== undefined) next.forcedDistrict = edits.district.trim()
  if (edits.source !== undefined) next.sourceLabel = edits.source.trim()
  if (edits.tags !== undefined) next.extraTags = edits.tags
  if (edits.isBreaking !== undefined) next.isBreaking = edits.isBreaking

  return next
}

export function queueInputToEditorPayload(
  input: NewsroomArticleInput,
  meta?: { workerId?: string; status?: string; createdAt?: number }
): QueueEditorPayload {
  return {
    title: input.originalTitle?.trim() || '',
    summary: input.originalSummary?.trim() || '',
    content: input.originalContent?.trim() || '',
    imageUrl: input.imageUrl?.trim() || '',
    categoryId: input.forcedCategoryId?.trim() || '',
    city: input.forcedCity?.trim() || '',
    citySlug: input.forcedCitySlug?.trim() || '',
    district: input.forcedDistrict?.trim() || '',
    source: input.sourceLabel?.trim() || '',
    sourceUrl: input.sourceUrl?.trim() || '',
    tags: input.extraTags ?? [],
    isBreaking: input.isBreaking ?? false,
    workerId: meta?.workerId,
    status: meta?.status,
    createdAt: meta?.createdAt,
  }
}

export async function updateQueueItemPayload(
  db: Firestore,
  queueId: string,
  edits: ManualQueueEditFields
): Promise<QueueEditorPayload> {
  const queueRef = db.collection(Collections.NEWS_QUEUE).doc(queueId)
  const queueSnap = await queueRef.get()
  if (!queueSnap.exists) {
    throw new Error('Queue item not found')
  }

  const queueData = queueSnap.data() as NewsQueueDocument
  const mergedInput = mergeQueueEditFields(queueData.input, edits)
  const now = Date.now()

  await queueRef.update({
    input: mergedInput,
    updatedAt: now,
  })

  return queueInputToEditorPayload(mergedInput, {
    workerId: queueData.workerId,
    status: queueData.status,
    createdAt: queueData.createdAt,
  })
}

export async function publishQueueItemManual(
  db: Firestore,
  queueId: string,
  edits?: ManualQueueEditFields
): Promise<{ newsId: string; slug: string }> {
  const queueRef = db.collection(Collections.NEWS_QUEUE).doc(queueId)
  const queueSnap = await queueRef.get()
  if (!queueSnap.exists) {
    throw new Error('Queue item not found')
  }

  const queueData = queueSnap.data() as NewsQueueDocument
  const input = mergeQueueEditFields(queueData.input, edits ?? {})

  const title = input.originalTitle?.trim() || 'Başlıksız'
  const content = input.originalContent?.trim() || input.originalSummary?.trim() || ''
  const summary = input.originalSummary?.trim() || content.slice(0, 280)
  const imageUrl = input.imageUrl?.trim() || ''
  const categoryIdRaw = input.forcedCategoryId?.trim() || ''
  const city = input.forcedCity?.trim() || ''
  const citySlug = input.forcedCitySlug?.trim() || ''
  const sourceLabel = input.sourceLabel?.trim() || ''
  const tagsRaw = input.extraTags ?? []
  const isBreaking = input.isBreaking ?? false

  const { categoryId, tags } = normalizePublishedLocalCategory(
    categoryIdRaw,
    citySlug,
    tagsRaw,
  )

  const now = Date.now()
  const slug = buildNewsSlug(title)

  const newsDoc = {
    title,
    description: content,
    content,
    summary,
    spot: summary.slice(0, 160),
    slug,
    author: 'nahaber',
    authorId: 'nahaber',
    authorUsername: 'nahaber',
    authorDisplayName: 'NaHaber',
    thumbnail: imageUrl,
    coverImageUrl: imageUrl,
    imageUrl,
    videoUrl: '',
    category: categoryId,
    categoryId,
    city,
    citySlug,
    district: input.forcedDistrict?.trim() || '',
    country: 'Türkiye',
    location: city ? { city, country: 'Türkiye', lat: 0, lng: 0 } : null,
    tags,
    isBreaking,
    source: sourceLabel,
    sourceUrl: input.sourceUrl ?? '',
    type: 'news',
    postType: 'news',
    status: 'published',
    aiGenerated: false,
    featured: false,
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    mediaItems: imageUrl ? [{ type: 'image', url: imageUrl, order: 0 }] : [],
    approvedFromQueue: true,
    publishedVia: 'manual-publish',
    manuallyEdited: true,
    queueJobId: queueId,
  }

  const newsRef = db.collection(Collections.NEWS).doc()
  await newsRef.set(newsDoc)

  await recordStoryInLibrary(db, input, {
    newsId: newsRef.id,
    title,
    citySlug: citySlug || null,
  })

  await queueRef.update({
    status: 'published',
    input,
    publishedNewsId: newsRef.id,
    publishedVia: 'manual-publish',
    skipReason: 'manual-publish',
    updatedAt: now,
    lastError: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
  })

  try {
    revalidateHomeFeedCaches()
    if (categoryId) revalidatePath(`/kategori/${categoryId}`)
    if (categoryIdRaw !== categoryId) revalidatePath(`/kategori/${categoryIdRaw}`)
    if (isYerelCategoryTree(categoryIdRaw) || isYerelCategoryTree(categoryId)) {
      revalidatePath('/yerel')
    }
    revalidatePath(`/haber/${slug}`)
    void notifyPublishedArticle(slug).catch(() => {})
  } catch {
    /* best-effort */
  }

  return { newsId: newsRef.id, slug }
}
