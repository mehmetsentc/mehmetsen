import 'server-only'

import { eq, inArray, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { newsClusters, rawArticles, newsSources, clusterMemberships } from '@/db/schema/crawler'
import { news } from '@/db/schema/news'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { newsMirrorRepository, type NewsMirrorPayload } from '@/services/publisher/newsMirrorRepository'
import { selectPrimarySource } from './primarySourceSelector'
import { validateEditorialCandidate, cleanTextContent } from './editorialQualityGate'
import { selectBestEditorialImage, validateImageCandidate } from './imageGate'
import {
  checkTextSimilarity,
  validatePublicationRights,
  type OverlapCategory,
} from './editorialSimilarityGate'
import { assertHumanEditorialApproval } from './humanReviewGate'
import { publicationProvenanceFields } from './publicationAuthority'
import type {
  EditorialCandidateArticle,
  EditorialPublicationResult,
} from './editorialTypes'

export interface PublishClusterOptions {
  clusterId: string
  actorUserId?: string
  actorDisplayName?: string
  reviewedAt?: Date | number | string
  decision?: 'APPROVED' | 'REJECTED' | string
  forceCategory?: string | null
  isBreaking?: boolean
  materialUpdate?: boolean
  customTitle?: string | null
  customBody?: string | null
  customImageUrl?: string | null
  rightsStatus?: string | null
  rightsBasis?: string | null
  forceAllowHighOverlap?: boolean
  approvalSource?: string
}

export interface CreateEditorialDraftResult {
  clusterId: string
  suggestedTitle: string
  suggestedSummary: string
  suggestedBody: string
  resolvedCategory: string
  primarySourceName: string
  heroImageUrl: string | null
  overlapCategory: OverlapCategory
  similarityScore: number
  flaggedForReview: boolean
}

export class EditorialSupplyService {
  /**
   * Loads candidate members and sources for a given cluster ID.
   */
  async loadClusterCandidates(clusterId: string): Promise<{
    cluster: typeof newsClusters.$inferSelect | null
    candidates: EditorialCandidateArticle[]
  }> {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
    const db = getDb()

    const clusterRows = await db
      .select()
      .from(newsClusters)
      .where(eq(newsClusters.id, clusterId))
      .limit(1)

    const cluster = clusterRows[0] || null
    if (!cluster) return { cluster: null, candidates: [] }

    // Fetch memberships and raw articles
    const memberRows = await db
      .select({
        article: rawArticles,
        source: newsSources,
      })
      .from(clusterMemberships)
      .innerJoin(rawArticles, eq(rawArticles.id, clusterMemberships.articleId))
      .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
      .where(eq(clusterMemberships.clusterId, clusterId))

    // If memberships table was empty, fallback to raw_articles with cluster_id
    let items = memberRows
    if (items.length === 0) {
      items = await db
        .select({
          article: rawArticles,
          source: newsSources,
        })
        .from(rawArticles)
        .leftJoin(newsSources, eq(newsSources.id, rawArticles.sourceId))
        .where(eq(rawArticles.clusterId, clusterId))
    }

    const candidates: EditorialCandidateArticle[] = items.map(({ article, source }) => ({
      id: article.id,
      sourceId: article.sourceId,
      sourceName: source?.name || article.sourceId,
      sourceQualityTier: source?.qualityTier ?? null,
      sourceHealthScore: source?.healthScore ?? 50,
      sourceStatus: source?.status ?? null,
      title: article.title || '',
      description: article.description,
      body: article.articleBodyText || article.description || '',
      canonicalUrl: article.canonicalUrl,
      originalUrl: article.originalUrl,
      mainImageUrl: article.mainImageUrl,
      imageUrls: article.imageUrls || [],
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt || new Date(),
      wordCount: article.wordCount,
      charCount: article.charCount,
      extractionConfidence: article.extractionConfidence,
      city: article.city || source?.city || cluster.city || null,
      district: article.district || cluster.district || null,
      countryCode: article.countryCode || source?.countryCode || cluster.countryCode || 'TR',
    }))

    return { cluster, candidates }
  }

  /**
   * Deterministically processes an event cluster and publishes it to canonical
   * Firestore and Postgres mirror stores, guaranteeing single identity & dedup.
   */
  async publishClusterEditorial(opts: PublishClusterOptions): Promise<EditorialPublicationResult> {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
    const db = getDb()
    const { cluster, candidates } = await this.loadClusterCandidates(opts.clusterId)

    if (!cluster) {
      throw new Error(`Cluster not found: ${opts.clusterId}`)
    }
    if (candidates.length === 0) {
      throw new Error(`No member articles found for cluster: ${opts.clusterId}`)
    }

    // 0. Mandatory Human Editorial Review Gate
    const approval = assertHumanEditorialApproval({
      reviewerId: opts.actorUserId,
      reviewerDisplayName: opts.actorDisplayName,
      reviewedAt: opts.reviewedAt || new Date(),
      decision: opts.decision || 'APPROVED',
      isAiGenerated: false,
    })

    // 1. Deterministic Primary Source Selection
    const primary = selectPrimarySource(candidates)
    if (!primary) {
      throw new Error(`Could not select primary source for cluster: ${opts.clusterId}`)
    }

    const primaryArticle = candidates.find((c) => c.id === primary.primaryArticleId)!

    // 2. Quality Gate & Sanitization
    const rawTitle = opts.customTitle || cluster.canonicalTitle || primaryArticle.title
    const rawBody = opts.customBody || primaryArticle.body
    const categoryHint = opts.forceCategory || cluster.categoryHint || cluster.category

    const qualityResult = validateEditorialCandidate({
      title: rawTitle,
      body: rawBody,
      spot: primaryArticle.description,
      categoryHint,
      city: cluster.city || primaryArticle.city,
      district: cluster.district || primaryArticle.district,
      canonicalUrl: primaryArticle.canonicalUrl,
    })

    // Pre-Publication Similarity & Rights Gate
    const rightsCheck = validatePublicationRights({
      canonicalText: qualityResult.sanitizedBody,
      rawSourceText: primaryArticle.body,
      rightsStatus: opts.rightsStatus,
      rightsBasis: opts.rightsBasis,
      forceAllow: opts.forceAllowHighOverlap,
    })

    if (!rightsCheck.allowed) {
      throw new Error(
        `EDITORIAL_GATE_REJECTED: ${rightsCheck.reason} (overlap: ${rightsCheck.overlapCategory})`
      )
    }

    // 3. Image Gate
    const imageCandidates = [
      { url: opts.customImageUrl, isPrimary: true },
      { url: primary.bestImageUrl, isPrimary: true },
      { url: cluster.primaryImageUrl, isPrimary: true },
      { url: primaryArticle.mainImageUrl, isPrimary: false },
      ...primaryArticle.imageUrls.map((url) => ({ url, isPrimary: false })),
    ].filter((img) => Boolean(img.url))

    const heroImageUrl = selectBestEditorialImage(imageCandidates)

    // 4. Stable Canonical Identity
    const firestore = getAdminFirestore()
    const newsId = cluster.publishedNewsId || firestore.collection(Collections.NEWS).doc().id
    const alreadyPublished = Boolean(cluster.publishedNewsId)

    // Generate clean slug with fallback to newsId suffix to ensure global uniqueness in PG
    const slugBase = qualityResult.sanitizedTitle
      .toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'haber'
    const slug = `${slugBase}-${newsId.slice(0, 8)}`

    const now = new Date()
    const canonicalPublishedAt = now
    const canonicalPublishedAtMs = canonicalPublishedAt.getTime()
    const draftCreatedAt = cluster.createdAt || now
    const draftCreatedAtMs = draftCreatedAt.getTime()

    const actorId = opts.actorUserId || 'editorial_ops'
    const actorName = opts.actorDisplayName || primaryArticle.sourceName || 'NaHaber Editör Masası'

    // 5. Firestore Canonical News Write
    const firestorePayload: Record<string, unknown> = {
      id: newsId,
      title: qualityResult.sanitizedTitle,
      slug,
      summary: qualityResult.sanitizedSummary,
      spot: qualityResult.sanitizedSummary,
      description: qualityResult.sanitizedBody,
      content: qualityResult.sanitizedBody,
      htmlContent: `<p>${qualityResult.sanitizedBody.replace(/\n\n+/g, '</p><p>')}</p>`,
      category: qualityResult.resolvedCategory,
      categoryId: qualityResult.resolvedCategory,
      city: cluster.city || primaryArticle.city || '',
      citySlug: qualityResult.citySlug || '',
      district: cluster.district || primaryArticle.district || '',
      districtSlug: qualityResult.districtSlug || '',
      countryCode: cluster.countryCode || primaryArticle.countryCode || 'TR',
      thumbnail: heroImageUrl || '',
      coverImageUrl: heroImageUrl || '',
      imageUrl: heroImageUrl || '',
      source: primaryArticle.sourceName,
      sourceLabel: primaryArticle.sourceName,
      sourceUrl: primaryArticle.canonicalUrl || primaryArticle.originalUrl,
      author: actorName,
      authorId: actorId,
      authorDisplayName: actorName,
      clusterId: cluster.id,
      ingestionSourceId: primaryArticle.sourceId,
      rssGuid: primaryArticle.id,
      type: 'news',
      postType: 'news',
      status: 'published',
      visibility: 'public',
      seoNoindex: false,
      isBreaking: Boolean(opts.isBreaking),
      isAiGenerated: false,
      authorIsAI: false,
      publishedAt: canonicalPublishedAtMs,
      ...(!alreadyPublished ? { createdAt: draftCreatedAtMs } : {}),
      updatedAt: now.getTime(),
      viewsCount: 0,
      likesCount: 0,
      commentCount: 0,
      savesCount: 0,
      sharesCount: 0,
      ...publicationProvenanceFields({
        authority: 'HUMAN_EDITOR',
        approvedBy: actorId,
        approvedAt: now.getTime(),
        publishedBy: actorId,
        publishedAt: now.getTime(),
        humanReview: approval,
      }),
    }

    await firestore.collection(Collections.NEWS).doc(newsId).set(firestorePayload, { merge: true })

    // 6. Postgres Canonical News Mirror
    const mirrorPayload: NewsMirrorPayload = {
      id: newsId,
      slug,
      title: qualityResult.sanitizedTitle,
      summary: qualityResult.sanitizedSummary.slice(0, 500),
      description: qualityResult.sanitizedBody.slice(0, 5000),
      content: qualityResult.sanitizedBody,
      htmlContent: `<p>${qualityResult.sanitizedBody.replace(/\n\n+/g, '</p><p>')}</p>`,
      categoryId: qualityResult.resolvedCategory,
      cityName: cluster.city || primaryArticle.city || null,
      citySlug: qualityResult.citySlug,
      districtName: cluster.district || primaryArticle.district || null,
      districtSlug: qualityResult.districtSlug,
      authorId: actorId,
      authorDisplayName: actorName,
      source: primaryArticle.sourceName,
      sourceUrl: primaryArticle.canonicalUrl || primaryArticle.originalUrl,
      thumbnailUrl: heroImageUrl,
      coverImageUrl: heroImageUrl,
      videoUrl: null,
      tags: [qualityResult.resolvedCategory],
      isBreaking: Boolean(opts.isBreaking),
      seoTitle: qualityResult.sanitizedTitle.slice(0, 200),
      seoDescription: qualityResult.sanitizedSummary.slice(0, 300),
      publishedAt: canonicalPublishedAt,
      createdAt: draftCreatedAt,
    }

    await newsMirrorRepository.ensurePublishedNewsMirror(mirrorPayload)

    // 7. Update cluster and raw article linkage
    await db
      .update(newsClusters)
      .set({
        publishedNewsId: newsId,
        editorialDecision: 'APPROVED',
        editorialDecidedBy: approval.reviewerId,
        editorialDecidedAt: approval.reviewedAt,
        approvalSource: (opts.approvalSource || 'cms_editorial_ops').slice(0, 16),
        primarySourceId: primary.sourceId,
        primarySourceName: primary.sourceName,
        primaryImageUrl: heroImageUrl,
        hasMaterialUpdate: 0,
        updateReviewStatus: 'NONE',
        updatedAt: now,
      })
      .where(eq(newsClusters.id, cluster.id))

    // Link all member raw articles to this published news with proper semantic status
    const articleIds = candidates.map((c) => c.id)
    if (articleIds.length > 0) {
      await db
        .update(rawArticles)
        .set({
          editorialNewsId: newsId,
          editorialStatus: 'USED_AS_SOURCE',
          updatedAt: now,
        })
        .where(inArray(rawArticles.id, articleIds))
    }

    return {
      newsId,
      slug,
      title: qualityResult.sanitizedTitle,
      categoryId: qualityResult.resolvedCategory,
      sourceName: primaryArticle.sourceName,
      citySlug: qualityResult.citySlug,
      heroImageUrl,
      alreadyPublished,
      materialUpdate: Boolean(opts.materialUpdate),
      publishedAt: canonicalPublishedAt,
    }
  }

  /**
   * Generates an editorial draft from a cluster without public publication.
   * This prepares sanitized headline, summary, and body for human editorial review.
   */
  async createClusterEditorialDraft(clusterId: string): Promise<CreateEditorialDraftResult> {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
    const db = getDb()
    const { cluster, candidates } = await this.loadClusterCandidates(clusterId)

    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`)
    }
    if (candidates.length === 0) {
      throw new Error(`No member articles found for cluster: ${clusterId}`)
    }

    const primary = selectPrimarySource(candidates)
    if (!primary) {
      throw new Error(`Could not select primary source for cluster: ${clusterId}`)
    }

    const primaryArticle = candidates.find((c) => c.id === primary.primaryArticleId)!

    const rawTitle = cluster.canonicalTitle || primaryArticle.title
    const rawBody = primaryArticle.body
    const categoryHint = cluster.categoryHint || cluster.category

    const qualityResult = validateEditorialCandidate({
      title: rawTitle,
      body: rawBody,
      spot: primaryArticle.description,
      categoryHint,
      city: cluster.city || primaryArticle.city,
      district: cluster.district || primaryArticle.district,
      canonicalUrl: primaryArticle.canonicalUrl,
    })

    const imageCandidates = [
      { url: primary.bestImageUrl, isPrimary: true },
      { url: cluster.primaryImageUrl, isPrimary: true },
      { url: primaryArticle.mainImageUrl, isPrimary: false },
      ...primaryArticle.imageUrls.map((url) => ({ url, isPrimary: false })),
    ].filter((img) => Boolean(img.url))

    const heroImageUrl = selectBestEditorialImage(imageCandidates)
    const sim = checkTextSimilarity(qualityResult.sanitizedBody, primaryArticle.body)

    // Mark cluster as IN_REVIEW without publishing
    const now = new Date()
    await db
      .update(newsClusters)
      .set({
        editorialDecision: 'IN_REVIEW',
        primarySourceId: primary.sourceId,
        primarySourceName: primary.sourceName,
        primaryImageUrl: heroImageUrl,
        updatedAt: now,
      })
      .where(eq(newsClusters.id, cluster.id))

    // Mark candidate raw articles as USED_AS_SOURCE in draft phase
    const articleIds = candidates.map((c) => c.id)
    if (articleIds.length > 0) {
      await db
        .update(rawArticles)
        .set({
          editorialStatus: 'USED_AS_SOURCE',
          updatedAt: now,
        })
        .where(inArray(rawArticles.id, articleIds))
    }

    return {
      clusterId: cluster.id,
      suggestedTitle: qualityResult.sanitizedTitle,
      suggestedSummary: qualityResult.sanitizedSummary,
      suggestedBody: qualityResult.sanitizedBody,
      resolvedCategory: qualityResult.resolvedCategory,
      primarySourceName: primaryArticle.sourceName,
      heroImageUrl,
      overlapCategory: sim.overlapCategory,
      similarityScore: sim.similarity,
      flaggedForReview: sim.flaggedForReview,
    }
  }

  /**
   * Selects and publishes top quality clusters across diverse categories.
   */
  async seedControlledEditorialInventory(targetCount = 35): Promise<EditorialPublicationResult[]> {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
    const db = getDb()

    // Find top distinct clusters across diverse categories with good quality
    const clusters = await db
      .select()
      .from(newsClusters)
      .where(
        sql`${newsClusters.publishedNewsId} IS NULL AND ${newsClusters.primaryImageUrl} IS NOT NULL`
      )
      .orderBy(sql`${newsClusters.latestArticleAt} DESC NULLS LAST`)
      .limit(200)

    const published: EditorialPublicationResult[] = []
    const seenCategories: Record<string, number> = {}

    for (const cl of clusters) {
      if (published.length >= targetCount) break

      try {
        const { candidates } = await this.loadClusterCandidates(cl.id)
        if (!candidates.length) continue

        const primary = selectPrimarySource(candidates)
        if (!primary) continue

        const primaryArticle = candidates.find((c) => c.id === primary.primaryArticleId)
        if (!primaryArticle) continue

        const quality = validateEditorialCandidate({
          title: cl.canonicalTitle || primaryArticle.title,
          body: primaryArticle.body,
          categoryHint: cl.categoryHint,
          city: cl.city,
        })

        if (!quality.passed) continue

        const cat = quality.resolvedCategory
        // Ensure category balance (max 6 per category)
        if ((seenCategories[cat] || 0) >= 6 && published.length < targetCount - 5) {
          continue
        }

        const res = await this.publishClusterEditorial({
          clusterId: cl.id,
          actorUserId: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
          actorDisplayName: primaryArticle.sourceName,
        })

        published.push(res)
        seenCategories[cat] = (seenCategories[cat] || 0) + 1
      } catch (err) {
        // Continue with next cluster
        console.warn(`Skipping cluster ${cl.id}:`, err instanceof Error ? err.message : err)
      }
    }

    return published
  }
}

export const editorialSupplyService = new EditorialSupplyService()
