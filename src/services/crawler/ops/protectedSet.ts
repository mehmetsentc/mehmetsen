import { createHash } from 'node:crypto'

export const EDITORIAL_WORKFLOW_STATUSES = [
  'DRAFT',
  'EDITING',
  'IN_REVIEW',
  'AI_CANDIDATE',
] as const

export const PROTECTED_RAW_STATUSES = ['PUBLISHED', ...EDITORIAL_WORKFLOW_STATUSES] as const

export const MANUAL_CLUSTER_DECISIONS = ['APPROVED_FOR_AI'] as const

export type CmsNewsRef = {
  id: string
  status: string
  sourceUrl: string | null
  coverImageUrl: string | null
  thumbnailUrl: string | null
}

export type SnapshotRaw = {
  id: string
  editorialStatus: string
  editorialNewsId: string | null
  clusterId: string | null
  discoveredUrlId: string | null
  originalUrl: string
  normalizedUrl: string | null
  canonicalUrl: string | null
  mainImageUrl: string | null
  imageUrls: string[]
}

export type SnapshotCluster = {
  id: string
  publishedNewsId: string | null
  editorialDecision: string
  representativeArticleId: string | null
}

export type SnapshotMembership = {
  id: string
  clusterId: string
  articleId: string
}

export type SnapshotMedia = {
  id: string
  articleId: string
  sourceUrl: string
  normalizedUrl: string
}

export type SnapshotUrl = {
  id: string
  url: string
  normalizedUrl: string
  canonicalUrl: string | null
  urlHash: string
}

export type SnapshotSource = {
  id: string
  status: string
}

export type SnapshotAudit = {
  id: string
  entityType: string
  entityId: string | null
  action: string
}

export type CleanupSnapshot = {
  raw: SnapshotRaw[]
  clusters: SnapshotCluster[]
  memberships: SnapshotMembership[]
  media: SnapshotMedia[]
  urls: SnapshotUrl[]
  sources: SnapshotSource[]
  audits: SnapshotAudit[]
  cmsNews: CmsNewsRef[]
  cmsMediaUrls: string[]
  aiJobs: number
  ledgerRows: number
  fetchingUrls: number
}

export type ProtectReason =
  | 'published_status'
  | 'editorial_news_id'
  | 'editorial_workflow'
  | 'manual_audit'
  | 'published_news_url'
  | 'published_cluster'
  | 'approved_for_ai_cluster'
  | 'protected_cluster_member'
  | 'published_used_media'
  | 'fail_safe'

export type ProtectedSet = {
  rawIds: Set<string>
  clusterIds: Set<string>
  mediaIds: Set<string>
  urlIds: Set<string>
  reasons: Record<string, ProtectReason[]>
  publishedRaw: number
  editorialLinkedRaw: number
  manualEditorialRaw: number
  publishedNews: number
  publishedUsedMedia: number
}

function addReason(reasons: Record<string, ProtectReason[]>, id: string, reason: ProtectReason) {
  const cur = reasons[id] || []
  if (!cur.includes(reason)) cur.push(reason)
  reasons[id] = cur
}

function urlKey(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase().split('?')[0]
  return trimmed || null
}

export function computeProtectedSet(snapshot: CleanupSnapshot): ProtectedSet {
  const rawIds = new Set<string>()
  const clusterIds = new Set<string>()
  const mediaIds = new Set<string>()
  const urlIds = new Set<string>()
  const reasons: Record<string, ProtectReason[]> = {}

  const publishedNews = snapshot.cmsNews.filter((n) => n.status === 'published')
  const publishedNewsIds = new Set(publishedNews.map((n) => n.id))
  const publishedUrlKeys = new Set<string>()
  const publishedMediaKeys = new Set<string>()
  for (const news of snapshot.cmsNews) {
    if (news.status !== 'published' && !snapshot.raw.some((r) => r.editorialNewsId === news.id)) continue
    const src = urlKey(news.sourceUrl)
    if (src) publishedUrlKeys.add(src)
    for (const u of [news.coverImageUrl, news.thumbnailUrl]) {
      const k = urlKey(u)
      if (k) publishedMediaKeys.add(k)
    }
  }
  for (const u of snapshot.cmsMediaUrls) {
    const k = urlKey(u)
    if (k) publishedMediaKeys.add(k)
  }

  const auditedRaw = new Set(
    snapshot.audits.filter((a) => a.entityType === 'raw_article' && a.entityId).map((a) => a.entityId as string)
  )
  const auditedClusters = new Set(
    snapshot.audits.filter((a) => a.entityType === 'cluster' && a.entityId).map((a) => a.entityId as string)
  )

  for (const raw of snapshot.raw) {
    if (raw.editorialStatus === 'PUBLISHED') {
      rawIds.add(raw.id)
      addReason(reasons, raw.id, 'published_status')
    }
    if (raw.editorialNewsId) {
      rawIds.add(raw.id)
      addReason(reasons, raw.id, 'editorial_news_id')
    }
    if ((EDITORIAL_WORKFLOW_STATUSES as readonly string[]).includes(raw.editorialStatus)) {
      rawIds.add(raw.id)
      addReason(reasons, raw.id, 'editorial_workflow')
    }
    if (auditedRaw.has(raw.id)) {
      rawIds.add(raw.id)
      addReason(reasons, raw.id, 'manual_audit')
    }
    const keys = [raw.canonicalUrl, raw.normalizedUrl, raw.originalUrl].map(urlKey)
    if (keys.some((k) => k && publishedUrlKeys.has(k))) {
      rawIds.add(raw.id)
      addReason(reasons, raw.id, 'published_news_url')
    }
  }

  for (const cluster of snapshot.clusters) {
    if (cluster.publishedNewsId || (cluster.publishedNewsId && publishedNewsIds.has(cluster.publishedNewsId))) {
      clusterIds.add(cluster.id)
      addReason(reasons, cluster.id, 'published_cluster')
    }
    if (cluster.publishedNewsId) {
      clusterIds.add(cluster.id)
      addReason(reasons, cluster.id, 'published_cluster')
    }
    if ((MANUAL_CLUSTER_DECISIONS as readonly string[]).includes(cluster.editorialDecision)) {
      clusterIds.add(cluster.id)
      addReason(reasons, cluster.id, 'approved_for_ai_cluster')
    }
    if (auditedClusters.has(cluster.id)) {
      clusterIds.add(cluster.id)
      addReason(reasons, cluster.id, 'manual_audit')
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const m of snapshot.memberships) {
      if (rawIds.has(m.articleId) && !clusterIds.has(m.clusterId)) {
        clusterIds.add(m.clusterId)
        addReason(reasons, m.clusterId, 'protected_cluster_member')
        changed = true
      }
      if (clusterIds.has(m.clusterId) && !rawIds.has(m.articleId)) {
        rawIds.add(m.articleId)
        addReason(reasons, m.articleId, 'protected_cluster_member')
        changed = true
      }
    }
    for (const cluster of snapshot.clusters) {
      if (clusterIds.has(cluster.id) && cluster.representativeArticleId && !rawIds.has(cluster.representativeArticleId)) {
        rawIds.add(cluster.representativeArticleId)
        addReason(reasons, cluster.representativeArticleId, 'protected_cluster_member')
        changed = true
      }
    }
    for (const raw of snapshot.raw) {
      if (raw.clusterId && rawIds.has(raw.id) && !clusterIds.has(raw.clusterId)) {
        clusterIds.add(raw.clusterId)
        addReason(reasons, raw.clusterId, 'protected_cluster_member')
        changed = true
      }
      if (raw.clusterId && clusterIds.has(raw.clusterId) && !rawIds.has(raw.id)) {
        rawIds.add(raw.id)
        addReason(reasons, raw.id, 'protected_cluster_member')
        changed = true
      }
    }
  }

  for (const media of snapshot.media) {
    const used =
      publishedMediaKeys.has(urlKey(media.sourceUrl) || '') ||
      publishedMediaKeys.has(urlKey(media.normalizedUrl) || '')
    if (rawIds.has(media.articleId) || used) {
      mediaIds.add(media.id)
      addReason(reasons, media.id, used && !rawIds.has(media.articleId) ? 'published_used_media' : 'fail_safe')
      if (used) {
        rawIds.add(media.articleId)
        addReason(reasons, media.articleId, 'published_used_media')
      }
    }
  }

  changed = true
  while (changed) {
    changed = false
    for (const m of snapshot.memberships) {
      if (rawIds.has(m.articleId) && !clusterIds.has(m.clusterId)) {
        clusterIds.add(m.clusterId)
        addReason(reasons, m.clusterId, 'protected_cluster_member')
        changed = true
      }
      if (clusterIds.has(m.clusterId) && !rawIds.has(m.articleId)) {
        rawIds.add(m.articleId)
        addReason(reasons, m.articleId, 'protected_cluster_member')
        changed = true
      }
    }
    for (const raw of snapshot.raw) {
      if (raw.clusterId && rawIds.has(raw.id) && !clusterIds.has(raw.clusterId)) {
        clusterIds.add(raw.clusterId)
        addReason(reasons, raw.clusterId, 'protected_cluster_member')
        changed = true
      }
      if (raw.clusterId && clusterIds.has(raw.clusterId) && !rawIds.has(raw.id)) {
        rawIds.add(raw.id)
        addReason(reasons, raw.id, 'protected_cluster_member')
        changed = true
      }
    }
  }

  const protectedRaw = snapshot.raw.filter((r) => rawIds.has(r.id))
  for (const raw of protectedRaw) {
    if (raw.discoveredUrlId) urlIds.add(raw.discoveredUrlId)
  }
  for (const url of snapshot.urls) {
    const keys = [url.canonicalUrl, url.normalizedUrl, url.url].map(urlKey)
    if (keys.some((k) => k && publishedUrlKeys.has(k))) urlIds.add(url.id)
  }

  return {
    rawIds,
    clusterIds,
    mediaIds,
    urlIds,
    reasons,
    publishedRaw: snapshot.raw.filter((r) => r.editorialStatus === 'PUBLISHED').length,
    editorialLinkedRaw: snapshot.raw.filter((r) => Boolean(r.editorialNewsId)).length,
    manualEditorialRaw: snapshot.raw.filter(
      (r) =>
        rawIds.has(r.id) &&
        (r.editorialStatus !== 'PUBLISHED' || Boolean(r.editorialNewsId)) &&
        ((EDITORIAL_WORKFLOW_STATUSES as readonly string[]).includes(r.editorialStatus) ||
          auditedRaw.has(r.id) ||
          Boolean(r.editorialNewsId))
    ).length,
    publishedNews: publishedNews.length,
    publishedUsedMedia: snapshot.media.filter((m) => mediaIds.has(m.id) && (reasons[m.id] || []).includes('published_used_media')).length,
  }
}

export type CleanupPlan = {
  dryRun: true
  executed: false
  planHash: string
  rawTotal: number
  protectedPublishedRaw: number
  protectedEditorialLinkedRaw: number
  protectedManualEditorial: number
  rawEligible: number
  urlTotal: number
  urlEligible: number
  clusterTotal: number
  clusterProtected: number
  clusterEligible: number
  membershipTotal: number
  membershipEligible: number
  mediaTotal: number
  mediaProtected: number
  mediaEligible: number
  auditRows: number
  provenanceRows: number
  aiJobs: number
  ledgerRows: number
  approvedForAi: number
  publishedRaw: number
  publishedNews: number
  sourceCount: number
  sourceActive: number
  sourcePaused: number
  fetchingUrls: number
  eligibleRawIds: string[]
  protectedRawIds: string[]
  eligibleClusterIds: string[]
  protectedClusterIds: string[]
  eligibleMediaIds: string[]
  protectedMediaIds: string[]
  eligibleUrlIds: string[]
  protectedUrlIds: string[]
  invariants: {
    publishedNewsDeleted: 0
    publishedRawDeleted: 0
    publishedLinkedRawDeleted: 0
    publishedUsedMediaDeleted: 0
    auditRowsDeleted: 0
    sourceRegistryRowsDeleted: 0
    editorialPublicationHistoryDeleted: 0
    aiProviderCalls: 0
  }
  invariantOk: boolean
  notes: string[]
}

export function hashCleanupPlan(input: {
  protectedRawIds: string[]
  eligibleRawIds: string[]
  protectedClusterIds: string[]
  eligibleClusterIds: string[]
  protectedMediaIds: string[]
  eligibleMediaIds: string[]
  protectedUrlIds: string[]
  eligibleUrlIds: string[]
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        pr: [...input.protectedRawIds].sort(),
        er: [...input.eligibleRawIds].sort(),
        pc: [...input.protectedClusterIds].sort(),
        ec: [...input.eligibleClusterIds].sort(),
        pm: [...input.protectedMediaIds].sort(),
        em: [...input.eligibleMediaIds].sort(),
        pu: [...input.protectedUrlIds].sort(),
        eu: [...input.eligibleUrlIds].sort(),
      })
    )
    .digest('hex')
    .slice(0, 32)
}

export function buildCleanupPlan(snapshot: CleanupSnapshot): CleanupPlan {
  const protectedSet = computeProtectedSet(snapshot)
  const eligibleRawIds = snapshot.raw.filter((r) => !protectedSet.rawIds.has(r.id)).map((r) => r.id)
  const eligibleClusterIds = snapshot.clusters.filter((c) => !protectedSet.clusterIds.has(c.id)).map((c) => c.id)
  const eligibleMediaIds = snapshot.media.filter((m) => !protectedSet.mediaIds.has(m.id)).map((m) => m.id)
  const eligibleUrlIds = snapshot.urls.filter((u) => !protectedSet.urlIds.has(u.id)).map((u) => u.id)
  const membershipEligible = snapshot.memberships.filter(
    (m) => eligibleRawIds.includes(m.articleId) || eligibleClusterIds.includes(m.clusterId)
  ).length
  const protectedRawIds = [...protectedSet.rawIds]
  const protectedClusterIds = [...protectedSet.clusterIds]
  const protectedMediaIds = [...protectedSet.mediaIds]
  const protectedUrlIds = [...protectedSet.urlIds]
  const planHash = hashCleanupPlan({
    protectedRawIds,
    eligibleRawIds,
    protectedClusterIds,
    eligibleClusterIds,
    protectedMediaIds,
    eligibleMediaIds,
    protectedUrlIds,
    eligibleUrlIds,
  })

  const invariants = {
    publishedNewsDeleted: 0 as const,
    publishedRawDeleted: 0 as const,
    publishedLinkedRawDeleted: 0 as const,
    publishedUsedMediaDeleted: 0 as const,
    auditRowsDeleted: 0 as const,
    sourceRegistryRowsDeleted: 0 as const,
    editorialPublicationHistoryDeleted: 0 as const,
    aiProviderCalls: 0 as const,
  }

  const wouldDeletePublishedRaw = eligibleRawIds.some((id) => {
    const row = snapshot.raw.find((r) => r.id === id)
    return row?.editorialStatus === 'PUBLISHED'
  })
  const wouldDeleteLinked = eligibleRawIds.some((id) => {
    const row = snapshot.raw.find((r) => r.id === id)
    return Boolean(row?.editorialNewsId)
  })
  const wouldDeletePublishedMedia = eligibleMediaIds.some((id) => (protectedSet.reasons[id] || []).includes('published_used_media'))

  const invariantOk = !wouldDeletePublishedRaw && !wouldDeleteLinked && !wouldDeletePublishedMedia

  return {
    dryRun: true,
    executed: false,
    planHash,
    rawTotal: snapshot.raw.length,
    protectedPublishedRaw: protectedSet.publishedRaw,
    protectedEditorialLinkedRaw: protectedSet.editorialLinkedRaw,
    protectedManualEditorial: protectedSet.manualEditorialRaw,
    rawEligible: eligibleRawIds.length,
    urlTotal: snapshot.urls.length,
    urlEligible: eligibleUrlIds.length,
    clusterTotal: snapshot.clusters.length,
    clusterProtected: protectedClusterIds.length,
    clusterEligible: eligibleClusterIds.length,
    membershipTotal: snapshot.memberships.length,
    membershipEligible,
    mediaTotal: snapshot.media.length,
    mediaProtected: protectedMediaIds.length,
    mediaEligible: eligibleMediaIds.length,
    auditRows: snapshot.audits.length,
    provenanceRows: snapshot.raw.filter((r) => Boolean(r.editorialNewsId)).length,
    aiJobs: snapshot.aiJobs,
    ledgerRows: snapshot.ledgerRows,
    approvedForAi: snapshot.clusters.filter((c) => c.editorialDecision === 'APPROVED_FOR_AI').length,
    publishedRaw: protectedSet.publishedRaw,
    publishedNews: protectedSet.publishedNews,
    sourceCount: snapshot.sources.length,
    sourceActive: snapshot.sources.filter((s) => s.status === 'ACTIVE').length,
    sourcePaused: snapshot.sources.filter((s) => s.status === 'PAUSED').length,
    fetchingUrls: snapshot.fetchingUrls,
    eligibleRawIds,
    protectedRawIds,
    eligibleClusterIds,
    protectedClusterIds,
    eligibleMediaIds,
    protectedMediaIds,
    eligibleUrlIds,
    protectedUrlIds,
    invariants,
    invariantOk,
    notes: [
      'PUBLISHED raw, editorial_news_id, workflow drafts, audit-touched rows, and published-used media are kept.',
      'news_sources and crawler_editorial_audit are never deleted.',
      'R2/object binaries are not deleted.',
      'This plan does not mutate until execute=1 with super_admin after invariants pass.',
      invariantOk ? 'Protection invariants proven for dry-run eligible set.' : 'PHASE 4A.5 BLOCKED — PROTECTION INVARIANT FAILED',
    ],
  }
}

export function livePlanCompatible(dryRun: CleanupPlan, live: CleanupPlan): { ok: boolean; reason?: string } {
  const dryProtected = new Set(dryRun.protectedRawIds)
  for (const id of dryProtected) {
    if (!live.protectedRawIds.includes(id) && live.eligibleRawIds.includes(id)) {
      return { ok: false, reason: 'protected raw set shrank; aborting to fail safe' }
    }
  }
  if (live.publishedNews < dryRun.publishedNews) {
    return { ok: false, reason: 'published news count decreased' }
  }
  if (live.sourceCount < dryRun.sourceCount) {
    return { ok: false, reason: 'source registry count decreased' }
  }
  if (live.auditRows < dryRun.auditRows) {
    return { ok: false, reason: 'audit rows decreased before execute' }
  }
  return { ok: true }
}
