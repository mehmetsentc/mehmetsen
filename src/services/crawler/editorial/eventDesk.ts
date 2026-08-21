/**
 * Phase 4B — event-first newsroom admin contracts.
 * EVENT is the primary editorial unit (not raw article copies).
 * Presentation-only; does not rename DB enums.
 */

import type { NewsClusterRecord } from '../types'
import { eventAgeHours, sourceDiversityLabel } from './controlPlane'
import { EDITORIAL_DECISION_LABELS, EDITORIAL_PRIORITY_LABELS, CRAWLER_STATUS_LABELS, MACHINE_DRAFT_ELIGIBILITY_LABELS } from './labels'
import { cmsLabel } from '@/services/cms/uiLabels'

export interface EventDeskRow {
  id: string
  title: string
  ageHours: number
  location: string
  category: string | null
  priority: string
  priorityLabel: string
  status: string
  statusLabel: string
  articleCount: number
  sourceCount: number
  independentSourceCount: number
  primaryArticleId: string | null
  primarySourceName: string | null
  quality: number
  confidence: number
  bestMediaUrl: string | null
  supportingSourceCount: number
  firstSeenAt: string | Date
  lastSeenAt: string | Date
  lastUpdateAt: string | Date
  editorialDecision: string
  editorialDecisionLabel: string
  /** Phase 4F.1 — machine automatic selection (never shown as editor approval). */
  machineDraftEligibility?: string | null
  machineDraftEligibilityLabel?: string | null
  machineDraftEligibilityReason?: string | null
  aiEligibility: string
  aiEligibilityLabel: string
  autoDraftStatus?: string | null
  autoDraftStatusLabel?: string | null
  estimatedAiCostUsd?: number | null
  hasMaterialUpdate: boolean
  sourceDiversity: string
  futureAiJobs: 1
}

export interface EventMatchEvidenceSummary {
  band: string | null
  blockedReason: string | null
  titleSimilarity: number | null
  entityOverlap: number | null
  geoScore: number | null
  note: string
}

export function formatEventLocation(cluster: Pick<NewsClusterRecord, 'countryCode' | 'region' | 'city' | 'district'>): string {
  return [cluster.countryCode, cluster.region, cluster.city, cluster.district].filter(Boolean).join(' / ') || '—'
}

export function toEventDeskRow(cluster: NewsClusterRecord, now = new Date()): EventDeskRow {
  const independent = cluster.uniqueSourceCount || cluster.sourceCount || 1
  const supporting = Math.max(0, (cluster.articleCount || 1) - 1)
  const decision = cluster.editorialDecision || 'NONE'
  const eligibility = cluster.aiEligibility || 'WATCHING'
  const priority = cluster.editorialPriority || 'NORMAL'
  return {
    id: cluster.id,
    title: cluster.canonicalTitle || cluster.normalizedTopic || cluster.id,
    ageHours: Number(eventAgeHours(cluster, now).toFixed(1)),
    location: formatEventLocation(cluster),
    category: cluster.categoryHint || cluster.category || null,
    priority,
    priorityLabel: EDITORIAL_PRIORITY_LABELS[priority] || cmsLabel(priority),
    status: cluster.eventStatus || 'OPEN',
    statusLabel: CRAWLER_STATUS_LABELS[cluster.eventStatus] || cmsLabel(cluster.eventStatus, 'Açık'),
    articleCount: cluster.articleCount || 1,
    sourceCount: cluster.sourceCount || independent,
    independentSourceCount: independent,
    primaryArticleId: cluster.representativeArticleId,
    primarySourceName: cluster.primarySourceName,
    quality: cluster.importanceScore ?? 0,
    confidence: cluster.clusterConfidence ?? 0,
    bestMediaUrl: cluster.primaryImageUrl,
    supportingSourceCount: supporting,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    lastUpdateAt: cluster.latestArticleAt || cluster.lastSeenAt || cluster.updatedAt,
    editorialDecision: decision,
    editorialDecisionLabel: EDITORIAL_DECISION_LABELS[decision as keyof typeof EDITORIAL_DECISION_LABELS] || cmsLabel(decision),
    machineDraftEligibility: cluster.machineDraftEligibility ?? null,
    machineDraftEligibilityLabel: cluster.machineDraftEligibility
      ? MACHINE_DRAFT_ELIGIBILITY_LABELS[cluster.machineDraftEligibility] ||
        CRAWLER_STATUS_LABELS[cluster.machineDraftEligibility] ||
        cmsLabel(cluster.machineDraftEligibility)
      : null,
    machineDraftEligibilityReason: cluster.machineDraftEligibilityReason ?? null,
    aiEligibility: eligibility,
    aiEligibilityLabel: CRAWLER_STATUS_LABELS[eligibility] || cmsLabel(eligibility),
    autoDraftStatus: cluster.autoDraftStatus ?? null,
    autoDraftStatusLabel: cluster.autoDraftStatus
      ? CRAWLER_STATUS_LABELS[cluster.autoDraftStatus] || cmsLabel(cluster.autoDraftStatus)
      : null,
    estimatedAiCostUsd: null,
    hasMaterialUpdate: Boolean(cluster.hasMaterialUpdate),
    sourceDiversity: sourceDiversityLabel(cluster.articleCount, independent),
    futureAiJobs: 1,
  }
}

/** Same-event badge copy for Ham Haberler. */
export function sameEventBadgeLabel(articleCount: number, sourceCount: number): string {
  const n = Math.max(1, articleCount)
  const m = Math.max(1, sourceCount)
  return `AYNI OLAY · ${n} HABER · ${m} KAYNAK`
}

/** Phase 4E — multi-source event headline for admin desk. */
export function multiSourceEventSummary(input: {
  title: string
  articleCount: number
  independentSourceCount: number
  primarySourceName?: string | null
  supportingSourceNames?: string[]
}): {
  headline: string
  countsTr: string
  primaryTr: string
  supportingTr: string
} {
  const supporting = (input.supportingSourceNames || []).filter(Boolean)
  return {
    headline: input.title,
    countsTr: `${input.articleCount} haber / ${input.independentSourceCount} bağımsız kaynak`,
    primaryTr: input.primarySourceName ? `PRIMARY: ${input.primarySourceName}` : 'PRIMARY: —',
    supportingTr: supporting.length ? `SUPPORTING: ${supporting.join(', ')}` : 'SUPPORTING: —',
  }
}

/** GÜNCELLEME VAR banner when material update after draft/publish. */
export function updateAvailableBannerTr(hasMaterialUpdate: boolean, status?: string | null): string | null {
  if (status === 'UPDATE_AVAILABLE' || hasMaterialUpdate) return 'GÜNCELLEME VAR'
  return null
}

export const EVENT_EDITORIAL_ACTIONS = [
  { op: 'review', label: 'İncelemeye Al' },
  { op: 'watch', label: 'İzlemeye Al' },
  { op: 'approve_for_ai', label: 'AI İçin Onayla' },
  { op: 'reject', label: 'Reddet' },
  { op: 'archive', label: 'Arşivle' },
  { op: 'restore', label: 'Geri Yükle' },
] as const
