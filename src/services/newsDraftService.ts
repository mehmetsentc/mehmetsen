/**
 * Server-side news draft → published news workflow (Admin SDK).
 * Used by admin API routes and publish-on-approve.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { buildNewsSlug } from '@/lib/newsSlug'
import type { NewsDraftDocument } from '@/types/news'

async function slugTaken(db: Firestore, slug: string, excludeId?: string): Promise<boolean> {
  const snap = await db.collection(Collections.NEWS).where('slug', '==', slug).limit(2).get()
  return snap.docs.some((d) => d.id !== excludeId)
}

async function allocateUniqueSlug(db: Firestore, title: string, draftId: string): Promise<string> {
  let candidate = buildNewsSlug(title)
  if (!(await slugTaken(db, candidate))) return candidate

  for (let i = 2; i <= 20; i++) {
    candidate = buildNewsSlug(title, String(i))
    if (!(await slugTaken(db, candidate))) return candidate
  }

  return buildNewsSlug(title, draftId.slice(0, 8))
}

/** Fields written by the newsroom pipeline (draft or auto-publish). */
export interface NewsroomDraftFields {
  title: string
  summary: string
  description: string
  author: string
  authorId: string
  thumbnail: string
  videoUrl: string
  category: string
  categoryId: string
  city: string
  district?: string
  citySlug: string
  country?: string
  location: { city: string; district?: string; country: string; lat: number; lng: number } | null
  tags: string[]
  type: 'news'
  source: string
  draftStatus?: NewsDraftDocument['draftStatus']
  moderationReasons?: string[]
  aiGenerated: boolean
  rssFingerprint: string
  rssGuid: string
  sourceUrl: string
  ingestionSourceId: string
  sourceLabel: string
  originalTitle: string
  ingestedAt: number
  sourcePublishedAt?: number | null
  createdAt: number
  updatedAt: number
  editorId?: string
  editorType?: string
  confidenceScore?: number
  factCheckFlags?: string[]
  isBreaking?: boolean
  priorityScore?: number
  breakingScore?: number
  isPinned?: boolean
  isTrending?: boolean
  needsAdminReview?: boolean
}

function draftToPublishedNews(
  draft: NewsDraftDocument | NewsroomDraftFields,
  slug: string,
  now: number
) {
  return {
    title: draft.title,
    summary: draft.summary ?? '',
    description: draft.description,
    author: draft.author,
    authorId: draft.authorId,
    thumbnail: draft.thumbnail,
    videoUrl: draft.videoUrl,
    category: draft.category,
    categoryId: draft.categoryId,
    city: draft.city,
    district: draft.district ?? '',
    citySlug: draft.citySlug,
    country: draft.country ?? 'Türkiye',
    location: draft.location,
    tags: draft.tags,
    type: draft.type,
    source: draft.source,
    slug,
    status: 'published' as const,
    aiGenerated: draft.aiGenerated,
    rssFingerprint: draft.rssFingerprint,
    rssGuid: draft.rssGuid,
    sourceUrl: draft.sourceUrl,
    ingestionSourceId: draft.ingestionSourceId,
    sourceLabel: draft.sourceLabel,
    originalTitle: draft.originalTitle,
    ingestedAt: draft.ingestedAt,
    sourcePublishedAt: draft.sourcePublishedAt ?? null,
    createdAt: draft.createdAt,
    updatedAt: now,
    publishedAt: now,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
    editorId: 'editorId' in draft ? draft.editorId : undefined,
    editorType: 'editorType' in draft ? draft.editorType : undefined,
    confidenceScore: 'confidenceScore' in draft ? draft.confidenceScore : undefined,
    isBreaking: 'isBreaking' in draft ? draft.isBreaking ?? false : false,
    priorityScore: 'priorityScore' in draft ? draft.priorityScore ?? 0 : 0,
    breakingScore: 'breakingScore' in draft ? draft.breakingScore ?? draft.priorityScore ?? 0 : 0,
    isPinned: 'isPinned' in draft ? draft.isPinned ?? false : false,
    isTrending: 'isTrending' in draft ? draft.isTrending ?? false : false,
  }
}

export const newsDraftService = {
  /** Auto-publish high-confidence pipeline output (skips draft queue). */
  async publishFromPipeline(
    db: Firestore,
    doc: NewsroomDraftFields
  ): Promise<{ newsId: string; slug: string }> {
    const now = Date.now()
    const draftId = doc.rssFingerprint.slice(0, 12)
    const slug = await allocateUniqueSlug(db, doc.title, draftId)
    const newsRef = await db.collection(Collections.NEWS).add(draftToPublishedNews(doc, slug, now))
    return { newsId: newsRef.id, slug }
  },

  /** Update an existing published article (source update or similarity merge). */
  async updatePublishedNews(
    db: Firestore,
    newsId: string,
    doc: NewsroomDraftFields,
    meta?: { duplicateOf?: string; canonicalId?: string }
  ): Promise<void> {
    const now = Date.now()
    const ref = db.collection(Collections.NEWS).doc(newsId)
    const snap = await ref.get()
    if (!snap.exists) throw new Error(`News not found: ${newsId}`)

    await ref.update({
      title: doc.title,
      summary: doc.summary,
      description: doc.description,
      thumbnail: doc.thumbnail || snap.data()?.thumbnail || '',
      category: doc.category,
      categoryId: doc.categoryId,
      city: doc.city,
      district: doc.district ?? '',
      citySlug: doc.citySlug,
      country: doc.country ?? 'Türkiye',
      location: doc.location,
      tags: doc.tags,
      source: doc.source,
      sourceUrl: doc.sourceUrl,
      sourceLabel: doc.sourceLabel,
      originalTitle: doc.originalTitle,
      sourcePublishedAt: doc.sourcePublishedAt ?? null,
      updatedAt: now,
      editorId: doc.editorId,
      editorType: doc.editorType,
      confidenceScore: doc.confidenceScore,
      factCheckFlags: doc.factCheckFlags,
      isBreaking: doc.isBreaking ?? false,
      priorityScore: doc.priorityScore ?? 0,
      breakingScore: doc.breakingScore ?? doc.priorityScore ?? 0,
      isPinned: doc.isPinned ?? false,
      isTrending: doc.isTrending ?? false,
      duplicateOf: meta?.duplicateOf ?? null,
      canonicalId: meta?.canonicalId ?? newsId,
    })
  },

  async approveDraft(draftId: string): Promise<{ newsId: string; slug: string }> {
    const db = getAdminFirestore()
    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(draftId)
    const draftSnap = await draftRef.get()

    if (!draftSnap.exists) {
      throw new Error('Draft not found')
    }

    const draft = draftSnap.data() as NewsDraftDocument
    if (draft.draftStatus === 'approved') {
      throw new Error('Draft already approved')
    }

    const now = Date.now()
    const slug = await allocateUniqueSlug(db, draft.title, draftId)
    const newsRef = await db.collection(Collections.NEWS).add(draftToPublishedNews(draft, slug, now))

    await draftRef.update({
      draftStatus: 'approved',
      approvedNewsId: newsRef.id,
      approvedSlug: slug,
      updatedAt: now,
    })

    return { newsId: newsRef.id, slug }
  },

  async rejectDraft(draftId: string, reason?: string): Promise<void> {
    const db = getAdminFirestore()
    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(draftId)
    const draftSnap = await draftRef.get()
    if (!draftSnap.exists) throw new Error('Draft not found')

    await draftRef.update({
      draftStatus: 'rejected',
      moderationNote: reason?.trim() || 'Admin tarafından reddedildi',
      updatedAt: Date.now(),
    })
  },

  /** Legacy: approve pending doc still in `news` collection. */
  async approveLegacyPending(newsId: string): Promise<{ newsId: string; slug: string }> {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWS).doc(newsId)
    const snap = await ref.get()
    if (!snap.exists) throw new Error('News not found')

    const data = snap.data() as { title?: string; status?: string; slug?: string }
    const now = Date.now()
    const slug = data.slug?.trim() || (await allocateUniqueSlug(db, data.title ?? 'haber', newsId))

    await ref.update({
      status: 'published',
      slug,
      publishedAt: now,
      updatedAt: now,
      moderationNote: null,
    })

    return { newsId, slug }
  },
}
