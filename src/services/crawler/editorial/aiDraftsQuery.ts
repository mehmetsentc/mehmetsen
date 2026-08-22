/**
 * Phase 4D.4 — AI Taslakları list/detail query helpers (cost-safe, snapshot-first).
 */

import { getDraftBodyWordCount } from '../autoDraft/draftBodyWords'
import {
  assessAiDraftQuality,
  formatAiCostUsd,
  type AiDraftQualityAssessment,
  type DraftQualityCode,
} from './aiDraftQuality'
import { aiJobFailureReasonTr } from '../autoDraft/aiFailureLabels'
import type { CrawlerAiJobRecord } from '../aiDispatch/types'

export const AI_DRAFT_PAGE_SIZES = [25, 50, 100] as const
export type AiDraftPageSize = (typeof AI_DRAFT_PAGE_SIZES)[number]

export type AiDraftListTab = 'completed' | 'failed'

export type AiDraftSortField = 'createdAt' | 'completedAt' | 'wordCount' | 'cost' | 'status'
export type AiDraftSortOrder = 'asc' | 'desc'

export type PersistedSourceEvidence = {
  articleId?: string
  sourceId?: string
  sourceName?: string
  role?: 'PRIMARY' | 'SUPPORTING' | string
  title?: string | null
  url?: string | null
  wordCount?: number | null
  extractionConfidence?: number | null
  healthScore?: number | null
}

export type AiDraftListItem = {
  jobId: string
  draftId: string | null
  clusterId: string
  eventKey: string | null
  title: string
  status: string
  statusLabelTr: string
  provider: string | null
  providerLabelTr: string
  model: string | null
  sourceName: string | null
  sourceCount: number
  wordCount: number | null
  costUsd: number | null
  costDisplay: string
  costPrecise: string | null
  qualityCode: DraftQualityCode
  qualityLabelTr: string
  createdAt: string | Date
  completedAt: string | Date | null
  failureCode: string | null
  failureReason: string | null
  failureReasonTr: string
}

export type AiDraftDetail = AiDraftListItem & {
  spot: string | null
  summary: string | null
  body: string | null
  tags: string[]
  category: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string[]
  socialTitle: string | null
  socialDescription: string | null
  pushTitle: string | null
  pushText: string | null
  imageAlt: string | null
  imageFilename: string | null
  slug: string | null
  primarySource: PersistedSourceEvidence | null
  supportingSources: PersistedSourceEvidence[]
  quality: AiDraftQualityAssessment
  draftSnapshot: Record<string, unknown> | null
  validationSnapshot: Record<string, unknown> | null
  executionId: string | null
  lane: string | null
}

const STATUS_TR: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  FAILED: 'Başarısız',
  BLOCKED: 'Engellendi',
  PENDING: 'Bekliyor',
  RESERVED: 'Ayrıldı',
  PROCESSING: 'İşleniyor',
  CANCELLED: 'İptal',
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function sourceEvidenceFromSnapshot(snap: Record<string, unknown> | null): PersistedSourceEvidence[] {
  const raw = snap?.sourceEvidence
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const o = asRecord(row) || {}
    return {
      articleId: asString(o.articleId) || undefined,
      sourceId: asString(o.sourceId) || undefined,
      sourceName: asString(o.sourceName) || undefined,
      role: asString(o.role) || undefined,
      title: asString(o.title),
      url: asString(o.url),
      wordCount: asNumber(o.wordCount),
      extractionConfidence: asNumber(o.extractionConfidence),
      healthScore: asNumber(o.healthScore),
    }
  })
}

export function isCompletedAiDraftJob(job: CrawlerAiJobRecord): boolean {
  if (job.status !== 'COMPLETED') return false
  const snap = asRecord(job.draftSnapshot)
  return Boolean(snap && (snap.body || snap.title || snap.draftId || job.editorialNewsId))
}

export function isFailedAiJob(job: CrawlerAiJobRecord): boolean {
  return job.status === 'FAILED' || job.status === 'BLOCKED'
}

export function mapJobToListItem(job: CrawlerAiJobRecord): AiDraftListItem {
  const snap = asRecord(job.draftSnapshot)
  const body = asString(snap?.body) || ''
  const words = getDraftBodyWordCount(snap)
  const evidence = sourceEvidenceFromSnapshot(snap)
  const packMetrics = asRecord(snap?.packMetrics)
  const quality =
    (asRecord(snap?.quality) as AiDraftQualityAssessment | null) ||
    assessAiDraftQuality({
      body,
      usableSourceWords: asNumber(packMetrics?.usableSourceWords),
      richness: (asString(packMetrics?.richness) as AiDraftQualityAssessment['richness']) || null,
      sources: evidence.map((e) => ({
        wordCount: e.wordCount,
        sourceId: e.sourceId,
      })),
    })
  const costUsd = job.actualCostUsd ?? asNumber(asRecord(snap?.cost)?.actualCostUsd)
  const costFmt = formatAiCostUsd(costUsd)
  const primary = evidence.find((e) => e.role === 'PRIMARY') || evidence[0] || null

  return {
    jobId: job.id,
    draftId: asString(snap?.draftId) || job.editorialNewsId,
    clusterId: job.clusterId,
    eventKey: job.eventKey,
    title: asString(snap?.title) || job.eventKey || job.clusterId,
    status: job.status,
    statusLabelTr: STATUS_TR[job.status] || job.status,
    provider: job.provider || asString(snap?.provider),
    providerLabelTr: 'Sağlayıcı',
    model: job.model || asString(snap?.model),
    sourceName: primary?.sourceName || null,
    sourceCount: evidence.length || asNumber(packMetrics?.sourceCount) || 0,
    wordCount: words,
    costUsd,
    costDisplay: costFmt.display,
    costPrecise: costFmt.precise,
    qualityCode: quality.code,
    qualityLabelTr: quality.labelTr,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    failureCode: job.failureCode || null,
    failureReason: job.failureReason || null,
    failureReasonTr: aiJobFailureReasonTr({
      failureCode: job.failureCode,
      failureReason: job.failureReason,
      status: job.status,
    }),
  }
}

export function mapJobToDetail(job: CrawlerAiJobRecord): AiDraftDetail {
  const base = mapJobToListItem(job)
  const snap = asRecord(job.draftSnapshot)
  const evidence = sourceEvidenceFromSnapshot(snap)
  const primary = evidence.find((e) => e.role === 'PRIMARY') || evidence[0] || null
  const supporting = evidence.filter((e) => e !== primary)
  const packMetrics = asRecord(snap?.packMetrics)
  const body = asString(snap?.body)
  const quality =
    (asRecord(snap?.quality) as AiDraftQualityAssessment | null) ||
    assessAiDraftQuality({
      body,
      usableSourceWords: asNumber(packMetrics?.usableSourceWords),
      richness: (asString(packMetrics?.richness) as AiDraftQualityAssessment['richness']) || null,
      sources: evidence.map((e) => ({ wordCount: e.wordCount, sourceId: e.sourceId })),
    })

  return {
    ...base,
    spot: asString(snap?.spot),
    summary: asString(snap?.summary),
    body,
    tags: Array.isArray(snap?.tags) ? (snap!.tags as string[]) : [],
    category: asString(snap?.category),
    seoTitle: asString(snap?.seoTitle),
    seoDescription: asString(snap?.seoDescription),
    seoKeywords: Array.isArray(snap?.seoKeywords) ? (snap!.seoKeywords as string[]) : [],
    socialTitle: asString(snap?.socialTitle),
    socialDescription: asString(snap?.socialDescription),
    pushTitle: asString(snap?.pushTitle),
    pushText: asString(snap?.pushText),
    imageAlt: asString(snap?.imageAlt),
    imageFilename: asString(snap?.imageFilename),
    slug: asString(snap?.slug),
    primarySource: primary,
    supportingSources: supporting,
    quality,
    draftSnapshot: snap,
    validationSnapshot: asRecord(job.validationSnapshot),
    executionId: job.executionId || asString(snap?.executionId),
    lane: asString(snap?.lane),
  }
}

export function filterSortPaginateJobs(
  jobs: CrawlerAiJobRecord[],
  opts: {
    tab: AiDraftListTab
    page: number
    pageSize: AiDraftPageSize
    sort: AiDraftSortField
    order: AiDraftSortOrder
    provider?: string | null
    model?: string | null
    quality?: string | null
  }
): { items: AiDraftListItem[]; total: number; page: number; pageSize: number; totalPages: number } {
  let filtered =
    opts.tab === 'completed' ? jobs.filter(isCompletedAiDraftJob) : jobs.filter(isFailedAiJob)

  if (opts.provider) {
    const p = opts.provider.toLowerCase()
    filtered = filtered.filter((j) => (j.provider || '').toLowerCase() === p)
  }
  if (opts.model) {
    const m = opts.model.toLowerCase()
    filtered = filtered.filter((j) => (j.model || '').toLowerCase() === m)
  }

  const mapped = filtered.map(mapJobToListItem)
  let items = mapped
  if (opts.quality) {
    items = items.filter((i) => i.qualityCode === opts.quality || i.qualityLabelTr === opts.quality)
  }

  const dir = opts.order === 'asc' ? 1 : -1
  items = [...items].sort((a, b) => {
    const av =
      opts.sort === 'wordCount'
        ? a.wordCount ?? -1
        : opts.sort === 'cost'
          ? a.costUsd ?? -1
          : opts.sort === 'status'
            ? a.status
            : opts.sort === 'completedAt'
              ? new Date(a.completedAt || 0).getTime()
              : new Date(a.createdAt).getTime()
    const bv =
      opts.sort === 'wordCount'
        ? b.wordCount ?? -1
        : opts.sort === 'cost'
          ? b.costUsd ?? -1
          : opts.sort === 'status'
            ? b.status
            : opts.sort === 'completedAt'
              ? new Date(b.completedAt || 0).getTime()
              : new Date(b.createdAt).getTime()
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })

  const total = items.length
  const pageSize = AI_DRAFT_PAGE_SIZES.includes(opts.pageSize as AiDraftPageSize)
    ? opts.pageSize
    : 25
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, opts.page), totalPages)
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Publish firewall — worker/crawler paths must never publish.
 * Human CMS publish requires explicit authenticated command + permission (enforced in API).
 */
export function aiDraftAutoPublishAllowed(): false {
  return false
}

export function assertHumanPublishCommand(input: {
  authenticated: boolean
  hasPublishPermission: boolean
  explicitPublish: boolean
  draftValid: boolean
}): { ok: true } | { ok: false; code: string; messageTr: string } {
  if (!input.authenticated) {
    return { ok: false, code: 'UNAUTHENTICATED', messageTr: 'Kimlik doğrulama gerekli.' }
  }
  if (!input.hasPublishPermission) {
    return { ok: false, code: 'FORBIDDEN', messageTr: 'Yayın yetkisi yok.' }
  }
  if (!input.explicitPublish) {
    return { ok: false, code: 'EXPLICIT_PUBLISH_REQUIRED', messageTr: 'Açık yayın komutu gerekli.' }
  }
  if (!input.draftValid) {
    return { ok: false, code: 'INVALID_DRAFT', messageTr: 'Geçerli taslak gerekli.' }
  }
  return { ok: true }
}
