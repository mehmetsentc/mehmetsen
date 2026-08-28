/**
 * Phase P16 — Editorial Supply Types
 */

export interface EditorialCandidateArticle {
  id: string
  sourceId: string
  sourceName: string
  sourceQualityTier: string | null
  sourceHealthScore: number
  sourceStatus: string | null
  title: string
  description: string | null
  body: string
  canonicalUrl: string | null
  originalUrl: string
  mainImageUrl: string | null
  imageUrls: string[]
  publishedAt: Date | null
  fetchedAt: Date
  wordCount: number | null
  charCount: number | null
  extractionConfidence: number | null
  city: string | null
  district: string | null
  countryCode: string | null
}

export interface EditorialCandidateCluster {
  id: string
  canonicalTitle: string | null
  eventKey: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  district: string | null
  categoryHint: string | null
  articleCount: number
  uniqueSourceCount: number
  importanceScore: number
  clusterConfidence: number
  primaryImageUrl: string | null
  publishedNewsId: string | null
  hasMaterialUpdate: boolean
  firstSeenAt: Date
  lastSeenAt: Date
  latestArticleAt: Date | null
}

export interface PrimarySourceSelection {
  primaryArticleId: string
  sourceId: string
  sourceName: string
  score: number
  reasons: string[]
  bestImageUrl: string | null
}

export interface QualityGateResult {
  passed: boolean
  qualityScore: number
  issues: string[]
  sanitizedTitle: string
  sanitizedSummary: string
  sanitizedBody: string
  resolvedCategory: string
  citySlug: string | null
  districtSlug: string | null
}

export interface ImageGateResult {
  valid: boolean
  reason: string | null
  url: string | null
}

export interface EditorialPublicationResult {
  newsId: string
  slug: string
  title: string
  categoryId: string
  sourceName: string
  citySlug: string | null
  heroImageUrl: string | null
  alreadyPublished: boolean
  materialUpdate: boolean
  publishedAt: Date
}
