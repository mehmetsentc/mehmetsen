import type { ClusterEditorialDecision, EditorialPriority, NewsClusterRecord } from '../types'

export type { EditorialPriority }

export const BULK_EVENT_CAP = 500
export const CLUSTER_BULK_CAP_ERROR =
  'Bu işlem en fazla 500 olay üzerinde uygulanabilir.\nFiltreyi daraltın.'
export const ARTICLE_BULK_CAP_ERROR =
  'Bu işlem en fazla 500 kayıt üzerinde uygulanabilir.\nFiltreyi daraltın.'

export interface ClusterFunnelCounts {
  total: number
  watching: number
  eligible: number
  highPriority: number
  approvedForAi: number
  rejected: number
  archived: number
  singleSource: number
  multiSource: number
  staleApproved: number
  olderThan24h: number
  breaking: number
  editorialHigh: number
}

export interface ClusterTabCounts {
  all: number
  watching: number
  eligible: number
  high: number
  approved: number
  rejected: number
  archived: number
}

export const EDITORIAL_PRIORITIES: EditorialPriority[] = ['NORMAL', 'HIGH', 'BREAKING']
export const EDITORIAL_PRIORITY_LABELS: Record<EditorialPriority, string> = {
  NORMAL: 'Normal',
  HIGH: 'Yüksek',
  BREAKING: 'Son Dakika',
}

export type ApprovalSource = 'cms_single' | 'cms_bulk'
export type EditorialSelectionMode = 'single' | 'current_page' | 'all_matching'

export function parseEditorialPriority(value: unknown): EditorialPriority {
  if (value === 'HIGH' || value === 'BREAKING' || value === 'NORMAL') return value
  return 'NORMAL'
}

export function parseApprovalSource(value: unknown, fallback: ApprovalSource): ApprovalSource {
  if (value === 'cms_single' || value === 'cms_bulk') return value
  return fallback
}

export function parseSelectionMode(value: unknown, matchFilter: boolean, idCount: number): EditorialSelectionMode {
  if (value === 'single' || value === 'current_page' || value === 'all_matching') return value
  if (matchFilter) return 'all_matching'
  if (idCount <= 1) return 'single'
  return 'current_page'
}

export function crawlerEditorialStaleHours(nowEnv = process.env): number {
  const n = Number(nowEnv.CRAWLER_EDITORIAL_STALE_HOURS?.trim())
  return Number.isFinite(n) && n > 0 ? n : 24
}

export function eventAgeHours(cluster: Pick<NewsClusterRecord, 'firstSeenAt'>, now = new Date()): number {
  return (now.getTime() - cluster.firstSeenAt.getTime()) / 3600000
}

export function staleWarning(ageHours: number, staleHours = crawlerEditorialStaleHours()): boolean {
  return ageHours > staleHours
}

export function requiresStaleSecondConfirm(ageHours: number): boolean {
  return ageHours > 72
}

export function staleConfirmMessage(ageHours: number): string {
  const hours = Math.round(ageHours)
  return `Bu olay ${hours} saat önce keşfedildi.\nEski bir haberi AI kuyruğuna almak üzeresiniz.`
}

export function approvedAiStatus(opts: {
  dispatchEnabled: boolean
  jobStatus?: string | null
}): string {
  if (opts.jobStatus === 'PROCESSING' || opts.jobStatus === 'RESERVED') return 'PROCESSING'
  if (opts.jobStatus === 'PENDING') return 'QUEUED'
  if (opts.dispatchEnabled) return 'BEKLİYOR'
  return 'BEKLİYOR — AI DISPATCH KAPALI'
}

export function sourceDiversityLabel(articleCount: number, uniqueSourceCount: number): string {
  return `${articleCount} haber / ${uniqueSourceCount} bağımsız kaynak`
}

export function isWatchingQueueCluster(cluster: Pick<NewsClusterRecord, 'aiEligibility' | 'editorialDecision'>): boolean {
  if (cluster.editorialDecision === 'WATCHING') return true
  return (
    cluster.aiEligibility === 'WATCHING' &&
    cluster.editorialDecision !== 'ARCHIVED' &&
    cluster.editorialDecision !== 'REJECTED'
  )
}

export function emptyClusterFunnel(): ClusterFunnelCounts {
  return {
    total: 0,
    watching: 0,
    eligible: 0,
    highPriority: 0,
    approvedForAi: 0,
    rejected: 0,
    archived: 0,
    singleSource: 0,
    multiSource: 0,
    staleApproved: 0,
    olderThan24h: 0,
    breaking: 0,
    editorialHigh: 0,
  }
}

export function funnelFromClusters(clusters: NewsClusterRecord[], now = new Date()): ClusterFunnelCounts {
  const staleHours = crawlerEditorialStaleHours()
  const out = emptyClusterFunnel()
  out.total = clusters.length
  for (const c of clusters) {
    if (isWatchingQueueCluster(c)) out.watching += 1
    if (c.aiEligibility === 'ELIGIBLE') out.eligible += 1
    if (c.aiEligibility === 'HIGH_PRIORITY') out.highPriority += 1
    if (c.editorialDecision === 'APPROVED_FOR_AI') out.approvedForAi += 1
    if (c.editorialDecision === 'REJECTED' || c.aiEligibility === 'REJECTED') out.rejected += 1
    if (c.editorialDecision === 'ARCHIVED') out.archived += 1
    if (c.uniqueSourceCount <= 1) out.singleSource += 1
    if (c.uniqueSourceCount >= 2) out.multiSource += 1
    if (c.editorialDecision === 'APPROVED_FOR_AI' && eventAgeHours(c, now) > staleHours) out.staleApproved += 1
    if (eventAgeHours(c, now) > 24) out.olderThan24h += 1
    if (c.editorialPriority === 'BREAKING') out.breaking += 1
    if (c.editorialPriority === 'HIGH') out.editorialHigh += 1
  }
  return out
}

export function tabCountsFromClusters(clusters: NewsClusterRecord[]): ClusterTabCounts {
  return {
    all: clusters.length,
    watching: clusters.filter(isWatchingQueueCluster).length,
    eligible: clusters.filter((c) => c.aiEligibility === 'ELIGIBLE').length,
    high: clusters.filter((c) => c.aiEligibility === 'HIGH_PRIORITY').length,
    approved: clusters.filter((c) => c.editorialDecision === 'APPROVED_FOR_AI').length,
    rejected: clusters.filter((c) => c.editorialDecision === 'REJECTED' || c.aiEligibility === 'REJECTED').length,
    archived: clusters.filter((c) => c.editorialDecision === 'ARCHIVED').length,
  }
}

export function groupMembersBySource<T extends { sourceId: string }>(members: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const m of members) {
    const list = map.get(m.sourceId) || []
    list.push(m)
    map.set(m.sourceId, list)
  }
  return map
}

export function dashboardEditorialCounters(clusters: NewsClusterRecord[], now = new Date()) {
  const funnel = funnelFromClusters(clusters, now)
  return {
    rawPending: 0,
    clusters: funnel.total,
    watching: funnel.watching,
    eligible: funnel.eligible,
    approvedForAi: funnel.approvedForAi,
    aiWaiting: funnel.approvedForAi,
    highPriority: funnel.highPriority + funnel.editorialHigh,
    breaking: funnel.breaking,
    staleApproved: funnel.staleApproved,
    olderThan24h: funnel.olderThan24h,
    rejected: funnel.rejected,
    archived: funnel.archived,
  }
}

export function isTerminalEditorial(decision: ClusterEditorialDecision): boolean {
  return decision === 'REJECTED' || decision === 'ARCHIVED'
}
