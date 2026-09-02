/**
 * Server-side news draft → published news workflow (Admin SDK).
 * Used by admin API routes and publish-on-approve.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { buildNewsSlug, isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { countPlainWords } from '@/lib/contentQuality'
import type { NewsDraftDocument } from '@/types/news'
import {
  authorizePublication,
  publicationProvenanceFields,
  type HumanPublicationActor,
} from '@/services/editorial/publicationAuthority'

export type { HumanPublicationActor }

/** Spot + gövde birlikte boşsa onaylanamaz (CMS'te “içerik yok” yayın engeli). */
export function draftHasPublishableBody(draft: {
  title?: string
  summary?: string
  description?: string
  spot?: string
  content?: string
  htmlContent?: string
  bodyBlocks?: unknown
}): boolean {
  const body = [draft.description, draft.content, draft.spot, draft.htmlContent]
    .map((v) => String(v || '').trim())
    .join('\n')
    .trim()

  if (countPlainWords(body) >= 40) return true

  const blocks = Array.isArray(draft.bodyBlocks) ? draft.bodyBlocks : []
  if (blocks.length > 0) return true

  // Yalnızca özet/başlık → yetersiz
  return false
}

async function slugTaken(db: Firestore, slug: string, excludeId?: string): Promise<boolean> {
  const snap = await db.collection(Collections.NEWS).where('slug', '==', slug).limit(2).get()
  return snap.docs.some((d) => d.id !== excludeId)
}

export async function allocateUniqueSlug(
  db: Firestore,
  title: string,
  draftId: string,
  excludeId?: string
): Promise<string> {
  let candidate = buildNewsSlug(title)
  if (!(await slugTaken(db, candidate, excludeId))) return candidate

  for (let i = 2; i <= 20; i++) {
    candidate = buildNewsSlug(title, String(i))
    if (!(await slugTaken(db, candidate, excludeId))) return candidate
  }

  return buildNewsSlug(title, draftId.slice(0, 8))
}

/**
 * Ensure a published news doc has a public SEO slug (never `taslak-*`).
 * Persists the upgrade when the current slug is a draft placeholder.
 */
export async function ensurePublicNewsSlug(
  db: Firestore,
  newsId: string,
  title: string,
  currentSlug?: string | null
): Promise<string> {
  const existing = currentSlug?.trim() || ''
  if (existing && !isPlaceholderDraftSlug(existing)) return existing

  const slug = await allocateUniqueSlug(db, title || 'haber', newsId, newsId)
  await db.collection(Collections.NEWS).doc(newsId).update({
    slug,
    updatedAt: Date.now(),
  })
  return slug
}

/** Fields written by the newsroom pipeline (draft or auto-publish). */
export interface NewsroomDraftFields {
  title: string
  summary: string
  description: string
  author: string
  authorId: string
  /** Public profile slug — required for /yazar links */
  authorUsername?: string
  authorDisplayName?: string
  authorPhotoURL?: string | null
  /** Persistent AI persona id (distinct from worker editorId) */
  aiEditorId?: string
  articleFormat?: 'standard' | 'column' | 'analysis'
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
  /** AI published live; awaiting post-publish CMS İnceleme */
  aiAutoPublished?: boolean
  needsReview?: boolean
  spot?: string
  content?: string
  bodyBlocks?: import('@/lib/articleBlocks').ArticleBlock[]
  articleLayout?: 'standard' | 'longform'
  coverImageUrl?: string
  seoTitle?: string
  seoDescription?: string
  htmlContent?: string
  hasVideo?: boolean
  videoEmbedUrl?: string
}

function omitUndefinedFields(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function resolveSourceLabel(
  draft: NewsDraftDocument | NewsroomDraftFields
): string {
  const source = typeof draft.source === 'string' ? draft.source.trim() : ''
  if (source) return source
  const label = typeof draft.sourceLabel === 'string' ? draft.sourceLabel.trim() : ''
  if (label) return label
  return 'NaHaber'
}

function draftToPublishedNews(
  draft: NewsDraftDocument | NewsroomDraftFields,
  slug: string,
  now: number
) {
  const personaUsername =
    ('authorUsername' in draft && draft.authorUsername?.trim()) ||
    undefined
  const personaDisplayName =
    ('authorDisplayName' in draft && draft.authorDisplayName?.trim()) ||
    undefined
  const personaPhoto =
    'authorPhotoURL' in draft ? draft.authorPhotoURL : undefined
  const personaAiEditorId =
    ('aiEditorId' in draft && draft.aiEditorId?.trim()) ||
    (draft as NewsDraftDocument).aiEditorId?.trim() ||
    undefined
  const personaFormat =
    ('articleFormat' in draft && draft.articleFormat) ||
    (draft as NewsDraftDocument).articleFormat ||
    undefined

  const location =
    draft.location && typeof draft.location === 'object'
      ? omitUndefinedFields({
          city: draft.location.city ?? '',
          district: draft.location.district,
          country: draft.location.country ?? 'Türkiye',
          lat: draft.location.lat ?? 0,
          lng: draft.location.lng ?? 0,
        })
      : null

  return omitUndefinedFields({
    title: draft.title,
    summary: draft.summary ?? '',
    description: draft.description,
    author: draft.author,
    authorId: draft.authorId,
    ...(personaUsername ? { authorUsername: personaUsername } : {}),
    ...(personaDisplayName ? { authorDisplayName: personaDisplayName } : {}),
    ...(personaPhoto !== undefined ? { authorPhotoURL: personaPhoto ?? null } : {}),
    ...(personaAiEditorId ? { aiEditorId: personaAiEditorId } : {}),
    ...(personaFormat === 'column' || personaFormat === 'analysis' || personaFormat === 'standard'
      ? { articleFormat: personaFormat }
      : {}),
    thumbnail: draft.thumbnail ?? '',
    videoUrl: draft.videoUrl ?? '',
    category: draft.category,
    categoryId: draft.categoryId,
    city: draft.city ?? '',
    district: draft.district ?? '',
    citySlug: draft.citySlug ?? '',
    country: draft.country ?? 'Türkiye',
    location,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    type: draft.type ?? 'news',
    source: resolveSourceLabel(draft),
    slug,
    status: 'published' as const,
    aiGenerated: draft.aiGenerated ?? false,
    rssFingerprint: draft.rssFingerprint ?? '',
    rssGuid: draft.rssGuid ?? draft.sourceUrl ?? '',
    sourceUrl: draft.sourceUrl ?? '',
    ingestionSourceId: draft.ingestionSourceId ?? '',
    sourceLabel: draft.sourceLabel ?? resolveSourceLabel(draft),
    originalTitle: draft.originalTitle ?? draft.title,
    ingestedAt: draft.ingestedAt ?? now,
    sourcePublishedAt: draft.sourcePublishedAt ?? null,
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
    publishedAt: now,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
    ...('editorId' in draft && draft.editorId ? { editorId: draft.editorId } : {}),
    ...('editorType' in draft && draft.editorType ? { editorType: draft.editorType } : {}),
    ...('confidenceScore' in draft && draft.confidenceScore != null
      ? { confidenceScore: draft.confidenceScore }
      : {}),
    ...('factCheckFlags' in draft && Array.isArray((draft as NewsroomDraftFields).factCheckFlags)
      ? { factCheckFlags: (draft as NewsroomDraftFields).factCheckFlags }
      : {}),
    isBreaking: 'isBreaking' in draft ? draft.isBreaking ?? false : false,
    priorityScore: 'priorityScore' in draft ? draft.priorityScore ?? 0 : 0,
    breakingScore:
      'breakingScore' in draft ? draft.breakingScore ?? draft.priorityScore ?? 0 : 0,
    isPinned: 'isPinned' in draft ? draft.isPinned ?? false : false,
    isTrending: 'isTrending' in draft ? draft.isTrending ?? false : false,
    ...('aiAutoPublished' in draft && draft.aiAutoPublished === true
      ? { aiAutoPublished: true }
      : {}),
    ...('needsReview' in draft && draft.needsReview === true ? { needsReview: true } : {}),
    ...('spot' in draft && draft.spot ? { spot: draft.spot } : {}),
    ...('content' in draft && draft.content ? { content: draft.content } : {}),
    ...('bodyBlocks' in draft && Array.isArray(draft.bodyBlocks) && draft.bodyBlocks.length > 0
      ? { bodyBlocks: draft.bodyBlocks }
      : {}),
    ...('articleLayout' in draft && draft.articleLayout
      ? { articleLayout: draft.articleLayout }
      : {}),
    ...('coverImageUrl' in draft && draft.coverImageUrl
      ? { coverImageUrl: draft.coverImageUrl }
      : {}),
    ...('seoTitle' in draft && draft.seoTitle ? { seoTitle: draft.seoTitle } : {}),
    ...('seoDescription' in draft && draft.seoDescription
      ? { seoDescription: draft.seoDescription }
      : {}),
    ...('htmlContent' in draft && draft.htmlContent ? { htmlContent: draft.htmlContent } : {}),
    ...('hasVideo' in draft && draft.hasVideo != null ? { hasVideo: draft.hasVideo } : {}),
    ...('videoEmbedUrl' in draft && draft.videoEmbedUrl
      ? { videoEmbedUrl: draft.videoEmbedUrl }
      : {}),
    // Preserve CMS “Öne Çıkan” when approving a draft that was pinned before publish
    ...(() => {
      const d = draft as NewsDraftDocument & {
        featured?: boolean
        isEditorPick?: boolean
        featuredAt?: number
      }
      if (d.featured === true || d.isEditorPick === true) {
        return {
          featured: true,
          isEditorPick: true,
          featuredAt: typeof d.featuredAt === 'number' ? d.featuredAt : now,
        }
      }
      return {}
    })(),
    ...(() => {
      const d = draft as NewsDraftDocument & {
        localFeatured?: boolean
        localFeaturedAt?: number
      }
      if (d.localFeatured === true) {
        return {
          localFeatured: true,
          localFeaturedAt: typeof d.localFeaturedAt === 'number' ? d.localFeaturedAt : now,
        }
      }
      return {}
    })(),
  })
}

function draftEditorialText(draft: NewsDraftDocument | NewsroomDraftFields): string {
  const d = draft as NewsDraftDocument & { content?: string; spot?: string }
  return [d.description, d.content, d.spot]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join('\n')
}

function draftSourceText(draft: NewsDraftDocument | NewsroomDraftFields): string {
  const d = draft as NewsDraftDocument & {
    originalContent?: string
    sourceBodyText?: string
    rawBodyText?: string
  }
  return [d.originalContent, d.sourceBodyText, d.rawBodyText]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join('\n')
}

export const newsDraftService = {
  /**
   * Pipeline public write — requires explicit publication authority.
   * Ordinary crawler/editorial auto-publish without HUMAN_EDITOR actor is rejected (fail-closed).
   */
  async publishFromPipeline(
    db: Firestore,
    doc: NewsroomDraftFields,
    options?: {
      newsId?: string
      publishedAt?: number
      preferredSlug?: string
      /** Required for NEW public publication — no implicit HUMAN_EDITOR. */
      actor?: HumanPublicationActor | null
    }
  ): Promise<{ newsId: string; slug: string }> {
    if (!options?.actor?.uid) {
      throw new Error(
        'PUBLICATION_AUTHORITY_REJECTED: publishFromPipeline requires HUMAN_EDITOR actor (auto-publish without authority is disabled)'
      )
    }

    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: options.actor.uid,
      actorDisplayName: options.actor.displayName,
      approvedAt: Date.now(),
      editorialText: draftEditorialText(doc),
      sourceText: draftSourceText(doc),
    })

    const now = Date.now()
    const draftId = doc.rssFingerprint.slice(0, 12)
    let slug = options?.preferredSlug?.trim() || ''
    if (slug && isPlaceholderDraftSlug(slug)) slug = ''
    if (slug && (await slugTaken(db, slug, options?.newsId))) slug = ''
    if (!slug) slug = await allocateUniqueSlug(db, doc.title, draftId, options?.newsId)

    const payload = {
      ...draftToPublishedNews(doc, slug, now),
      ...publicationProvenanceFields(authz),
      publishedAt: options?.publishedAt ?? authz.publishedAt,
      coverImageUrl: doc.coverImageUrl || doc.thumbnail || '',
      ...(doc.aiAutoPublished === true ? { aiAutoPublished: true } : {}),
      ...(doc.needsReview === true ? { needsReview: true } : {}),
    }

    if (options?.newsId) {
      const ref = db.collection(Collections.NEWS).doc(options.newsId)
      const existing = await ref.get()
      const prev = existing.data() as
        | {
            featured?: boolean
            isEditorPick?: boolean
            featuredAt?: number | { toMillis?: () => number } | null
          }
        | undefined

      // Full `.set()` would wipe CMS Öne Çıkan pins on RSS re-publish.
      const preserveFeatured =
        prev?.featured === true || prev?.isEditorPick === true
          ? {
              featured: true as const,
              isEditorPick: true as const,
              featuredAt:
                typeof prev.featuredAt === 'number'
                  ? prev.featuredAt
                  : typeof prev?.featuredAt?.toMillis === 'function'
                    ? prev.featuredAt.toMillis()
                    : now,
            }
          : {}

      await ref.set({ ...payload, ...preserveFeatured })
      return { newsId: options.newsId, slug }
    }

    const newsRef = await db.collection(Collections.NEWS).add(payload)
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
      spot: doc.spot ?? snap.data()?.spot ?? '',
      summary: doc.summary,
      description: doc.description,
      content: doc.content ?? doc.description,
      ...(Array.isArray(doc.bodyBlocks) && doc.bodyBlocks.length > 0
        ? { bodyBlocks: doc.bodyBlocks, htmlContent: '' }
        : {}),
      ...(doc.articleLayout ? { articleLayout: doc.articleLayout } : {}),
      ...(doc.authorUsername?.trim() ? { authorUsername: doc.authorUsername.trim() } : {}),
      ...(doc.authorDisplayName?.trim()
        ? { authorDisplayName: doc.authorDisplayName.trim() }
        : {}),
      ...(doc.authorPhotoURL !== undefined
        ? { authorPhotoURL: doc.authorPhotoURL ?? null }
        : {}),
      ...(doc.authorId ? { authorId: doc.authorId, author: doc.author } : {}),
      ...(doc.aiEditorId?.trim() ? { aiEditorId: doc.aiEditorId.trim() } : {}),
      ...(doc.articleFormat === 'column' ||
      doc.articleFormat === 'analysis' ||
      doc.articleFormat === 'standard'
        ? { articleFormat: doc.articleFormat }
        : {}),
      thumbnail: doc.thumbnail || snap.data()?.thumbnail || '',
      coverImageUrl: doc.coverImageUrl || doc.thumbnail || snap.data()?.coverImageUrl || '',
      category: doc.category,
      categoryId: doc.categoryId,
      city: doc.city,
      district: doc.district ?? '',
      citySlug: doc.citySlug,
      country: doc.country ?? 'Türkiye',
      location: doc.location,
      tags: doc.tags,
      source: doc.source?.trim() || doc.sourceLabel?.trim() || 'NaHaber',
      sourceUrl: doc.sourceUrl ?? '',
      sourceLabel: doc.sourceLabel?.trim() || doc.source?.trim() || 'NaHaber',
      originalTitle: doc.originalTitle ?? doc.title,
      sourcePublishedAt: doc.sourcePublishedAt ?? null,
      updatedAt: now,
      ...(doc.editorId ? { editorId: doc.editorId } : {}),
      ...(doc.editorType ? { editorType: doc.editorType } : {}),
      ...(doc.confidenceScore != null ? { confidenceScore: doc.confidenceScore } : {}),
      ...(Array.isArray(doc.factCheckFlags) ? { factCheckFlags: doc.factCheckFlags } : {}),
      isBreaking: doc.isBreaking ?? false,
      priorityScore: doc.priorityScore ?? 0,
      breakingScore: doc.breakingScore ?? doc.priorityScore ?? 0,
      isPinned: doc.isPinned ?? false,
      isTrending: doc.isTrending ?? false,
      ...(doc.aiAutoPublished === true ? { aiAutoPublished: true } : {}),
      ...(doc.needsReview === true
        ? { needsReview: true, needsAdminReview: true }
        : {}),
      duplicateOf: meta?.duplicateOf ?? null,
      canonicalId: meta?.canonicalId ?? newsId,
    })
  },

  async approveDraft(
    draftId: string,
    actor: HumanPublicationActor
  ): Promise<{ newsId: string; slug: string }> {
    if (!actor?.uid) {
      throw new Error(
        'PUBLICATION_AUTHORITY_REJECTED: approveDraft requires authenticated HUMAN_EDITOR actor'
      )
    }

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

    // Boş spot/içerik ile yayın engeli (bulk-approve / flush dahil)
    if (!draftHasPublishableBody(draft)) {
      // Özetten gövde kurtarma — hâlâ çok kısa ise reddet
      const summary = String(draft.summary || '').trim()
      const draftAny = draft as NewsDraftDocument & {
        spot?: string
        content?: string
        htmlContent?: string
        bodyBlocks?: unknown
      }
      if (summary.length >= 40 && !String(draft.description || '').trim()) {
        draftAny.description = summary
        draftAny.spot = draftAny.spot || summary.slice(0, 280)
        draftAny.content = draftAny.content || summary
        await draftRef.update({
          description: draftAny.description,
          spot: draftAny.spot,
          content: draftAny.content,
          updatedAt: Date.now(),
        })
      }
      if (!draftHasPublishableBody(draftAny)) {
        throw new Error('empty_content: Spot/içerik boş — AI ile hazırlayın veya metin girin')
      }
    }

    const now = Date.now()
    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: actor.uid,
      actorDisplayName: actor.displayName,
      approvedAt: now,
      editorialText: draftEditorialText(draft),
      sourceText: draftSourceText(draft),
      rightsStatus: (draft as { rightsStatus?: string }).rightsStatus,
      rightsBasis: (draft as { rightsBasis?: string }).rightsBasis,
    })

    const slug = await allocateUniqueSlug(db, draft.title, draftId)
    const newsRef = await db.collection(Collections.NEWS).add({
      ...draftToPublishedNews(draft, slug, now),
      ...publicationProvenanceFields(authz),
    })

    await draftRef.update({
      draftStatus: 'approved',
      approvedNewsId: newsRef.id,
      approvedSlug: slug,
      approvedBy: authz.approvedBy,
      approvedAt: authz.approvedAt,
      publicationAuthority: authz.authority,
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

  /** Legacy: approve pending doc still in `news` collection; also clears İnceleme flags. */
  async approveLegacyPending(
    newsId: string,
    actor: HumanPublicationActor
  ): Promise<{ newsId: string; slug: string }> {
    if (!actor?.uid) {
      throw new Error(
        'PUBLICATION_AUTHORITY_REJECTED: approveLegacyPending requires authenticated HUMAN_EDITOR actor'
      )
    }

    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWS).doc(newsId)
    const snap = await ref.get()
    if (!snap.exists) throw new Error('News not found')

    const data = snap.data() as {
      title?: string
      status?: string
      slug?: string
      featured?: boolean
      isEditorPick?: boolean
      featuredAt?: number | { toMillis?: () => number } | null
      localFeatured?: boolean
      localFeaturedAt?: number
      needsReview?: boolean
      aiAutoPublished?: boolean
      description?: string
      content?: string
      originalContent?: string
      sourceBodyText?: string
      rightsStatus?: string
      rightsBasis?: string
    }
    const now = Date.now()
    const authz = authorizePublication({
      authority: 'HUMAN_EDITOR',
      actorUid: actor.uid,
      actorDisplayName: actor.displayName,
      approvedAt: now,
      editorialText: [data.description, data.content].filter(Boolean).join('\n'),
      sourceText: [data.originalContent, data.sourceBodyText].filter(Boolean).join('\n'),
      rightsStatus: data.rightsStatus,
      rightsBasis: data.rightsBasis,
    })

    let slug = data.slug?.trim() || ''
    if (!slug || isPlaceholderDraftSlug(slug)) {
      slug = await allocateUniqueSlug(db, data.title ?? 'haber', newsId, newsId)
    }

    // Already live + AI İnceleme → human OK clears review flag (stays published)
    if (
      data.status === 'published' &&
      (data.needsReview === true || data.aiAutoPublished === true)
    ) {
      await ref.update({
        needsReview: false,
        needsAdminReview: false,
        reviewedAt: now,
        reviewedBy: authz.approvedBy,
        updatedAt: now,
        moderationNote: null,
        ...publicationProvenanceFields(authz),
        // Upgrade leftover draft placeholders even on review-clear path
        ...(isPlaceholderDraftSlug(data.slug) ? { slug } : {}),
      })
      return { newsId, slug }
    }

    await ref.update({
      status: 'published',
      slug,
      moderationNote: null,
      needsReview: false,
      needsAdminReview: false,
      ...publicationProvenanceFields(authz),
      // Preserve / normalize featured pin so approve after “Öne Çıkan” still surfaces
      ...(data.featured === true || data.isEditorPick === true
        ? {
            featured: true,
            isEditorPick: true,
            featuredAt:
              typeof data.featuredAt === 'number'
                ? data.featuredAt
                : now,
          }
        : {}),
      ...(data.localFeatured === true
        ? {
            localFeatured: true,
            localFeaturedAt:
              typeof data.localFeaturedAt === 'number' ? data.localFeaturedAt : now,
          }
        : {}),
    })

    return { newsId, slug }
  },
}
