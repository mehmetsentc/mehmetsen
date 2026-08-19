import type { CrawlerQualityStatus, NewsSourceRecord, RawArticleRecord } from '../types'

export const QUALITY_STATES = [
  'GOOD',
  'EXTRACTED',
  'LOW_CONFIDENCE',
  'TOO_SHORT',
  'PARTIAL',
  'EXTRACTION_FAILED',
  'FAILED',
  'STALE',
] as const

const STALE_MS = 72 * 60 * 60 * 1000
const MIN_BODY_CHARS = 80
const MIN_GOOD_WORDS = 120

export type QualityGateInput = {
  title: string | null
  body: string | null
  extractionConfidence: number
  wordCount: number
  boilerplateRatio: number
  linkDensity: number
  hasPrimaryImage: boolean
  primaryImageConfidence: number | null
  sourceHealth: number
  publishedAt: Date | null
  isDuplicateUrl: boolean
  now?: Date
}

export type QualityGateResult = {
  status: CrawlerQualityStatus
  reasons: string[]
  excludeFromCluster: boolean
  excludeFromEditorialFunnel: boolean
}

export function evaluateExtractionQuality(input: QualityGateInput): QualityGateResult {
  const reasons: string[] = []
  const body = (input.body || '').trim()
  const title = (input.title || '').trim()
  const now = input.now ?? new Date()

  if (input.isDuplicateUrl) reasons.push('duplicate_url')
  if (!title || title.length < 8) reasons.push('weak_title')
  if (!body) reasons.push('missing_body')
  if (body.length < MIN_BODY_CHARS || input.wordCount < 40) reasons.push('too_short')
  if (input.extractionConfidence < 0.4) reasons.push('low_confidence')
  if (input.boilerplateRatio > 0.35) reasons.push('high_boilerplate')
  if (input.linkDensity > 0.35) reasons.push('high_link_density')
  if (input.sourceHealth < 25) reasons.push('weak_source_health')
  if (input.publishedAt && now.getTime() - input.publishedAt.getTime() > STALE_MS) reasons.push('stale')
  if (!input.hasPrimaryImage) reasons.push('no_primary_image')
  else if ((input.primaryImageConfidence ?? 1) < 0.35) reasons.push('weak_primary_image')

  if (reasons.includes('missing_body') || (reasons.includes('too_short') && input.extractionConfidence < 0.25)) {
    return {
      status: 'EXTRACTION_FAILED',
      reasons,
      excludeFromCluster: true,
      excludeFromEditorialFunnel: true,
    }
  }
  if (reasons.includes('stale')) {
    return { status: 'STALE', reasons, excludeFromCluster: true, excludeFromEditorialFunnel: true }
  }
  if (reasons.includes('too_short')) {
    return { status: 'TOO_SHORT', reasons, excludeFromCluster: true, excludeFromEditorialFunnel: true }
  }
  if (reasons.includes('low_confidence')) {
    return { status: 'LOW_CONFIDENCE', reasons, excludeFromCluster: false, excludeFromEditorialFunnel: true }
  }
  const incomplete =
    reasons.includes('weak_title') ||
    reasons.includes('high_boilerplate') ||
    reasons.includes('high_link_density') ||
    input.wordCount < MIN_GOOD_WORDS
  if (incomplete) {
    return { status: 'PARTIAL', reasons, excludeFromCluster: false, excludeFromEditorialFunnel: true }
  }
  return { status: 'GOOD', reasons: reasons.length ? reasons : ['full_extraction'], excludeFromCluster: false, excludeFromEditorialFunnel: false }
}

export function shouldEnterClusterFunnel(status: CrawlerQualityStatus | string | null | undefined): boolean {
  return status === 'GOOD' || status === 'EXTRACTED' || status === 'PARTIAL' || status === 'LOW_CONFIDENCE'
}

export function isSuccessfulExtraction(status: CrawlerQualityStatus | string | null | undefined): boolean {
  return status === 'GOOD' || status === 'EXTRACTED'
}

export function clusterHasPublishedOutput(
  members: Array<Pick<RawArticleRecord, 'editorialStatus' | 'editorialNewsId'>>
): { published: boolean; newsId: string | null } {
  const hit = members.find((m) => m.editorialStatus === 'PUBLISHED' || Boolean(m.editorialNewsId))
  return { published: Boolean(hit), newsId: hit?.editorialNewsId || null }
}

export function sourceHealthOf(source: Pick<NewsSourceRecord, 'healthScore'> | null | undefined): number {
  return source?.healthScore ?? 50
}
