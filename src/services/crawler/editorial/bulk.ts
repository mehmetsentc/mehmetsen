import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from '../dispatch'
import { matchesClusterQuery, matchesRawArticleQuery, type ClusterListQuery } from './query'
import { authorizeCrawlerBulk, type CrawlerBulkAction } from './rbac'
import { REJECTION_REASON_CODES } from './labels'
import type { CrawlerStore, RawArticleListQuery } from '../store/types'
import { newCrawlerId } from '../store/types'
import type {
  ClusterEditorialDecision,
  CrawlerEditorialAuditRecord,
  CrawlerEditorialStatus,
  CrawlerRejectionReason,
  EditorialPriority,
  NewsClusterRecord,
  RawArticleRecord,
} from '../types'
import type { CmsRole } from '@/types/cms'
import {
  ARTICLE_BULK_CAP_ERROR,
  BULK_EVENT_CAP,
  CLUSTER_BULK_CAP_ERROR,
  eventAgeHours,
  parseApprovalSource,
  parseEditorialPriority,
  parseSelectionMode,
  requiresStaleSecondConfirm,
  staleConfirmMessage,
  type ApprovalSource,
  type EditorialSelectionMode,
} from './controlPlane'

export const BULK_ID_CAP = BULK_EVENT_CAP
export const FILTER_MATCH_CAP = 10_000

export type ArticleBulkOp = 'review' | 'ai_candidate' | 'reject' | 'archive' | 'delete'
export type ClusterBulkOp = 'approve_for_ai' | 'watch' | 'reject' | 'archive' | 'restore'

export interface BulkResult {
  requested: number
  affected: number
  skipped: number
  failed: number
  skippedReasons: string[]
  tombstoned: number
  hardDeleted: number
  dispatchAttempted: false
  aiRequests: 0
  dispatchEnabled: boolean
}

export interface BulkActor {
  uid: string
  role: CmsRole
  email: string
}

const LOCKED_ARTICLE: CrawlerEditorialStatus[] = ['PUBLISHED', 'DELETED']

function emptyResult(requested: number): BulkResult {
  return {
    requested,
    affected: 0,
    skipped: 0,
    failed: 0,
    skippedReasons: [],
    tombstoned: 0,
    hardDeleted: 0,
    dispatchAttempted: false,
    aiRequests: 0,
    dispatchEnabled: isCrawlerAiDispatchEnabled(),
  }
}

function skip(result: BulkResult, reason: string) {
  result.skipped += 1
  result.skippedReasons.push(reason)
}

export function parseRejectionReason(value: string | null | undefined): CrawlerRejectionReason | null {
  if (!value) return null
  return REJECTION_REASON_CODES.includes(value as CrawlerRejectionReason)
    ? (value as CrawlerRejectionReason)
    : null
}

export function assertNoAiDispatch(): { aiRequests: 0; dispatched: false; dispatchEnabled: boolean } {
  const gate = dispatchCrawlerArticleToNewsroom()
  return {
    aiRequests: gate.aiRequests,
    dispatched: false,
    dispatchEnabled: isCrawlerAiDispatchEnabled(),
  }
}

async function resolveArticleIds(
  store: CrawlerStore,
  body: { ids?: string[]; matchFilter?: boolean; filter?: RawArticleListQuery }
): Promise<{ ids: string[]; requested: number; error?: string }> {
  if (body.matchFilter) {
    const listed = await store.listRawArticleIds(body.filter || {}, FILTER_MATCH_CAP)
    if (listed.total > BULK_ID_CAP) return { ids: [], requested: listed.total, error: ARTICLE_BULK_CAP_ERROR }
    return { ids: listed.ids, requested: listed.total }
  }
  const ids = [...new Set((body.ids || []).map((id) => id.trim()).filter(Boolean))]
  if (ids.length > BULK_ID_CAP) return { ids: [], requested: ids.length, error: ARTICLE_BULK_CAP_ERROR }
  return { ids, requested: ids.length }
}

export function clusterFilterFromBody(filter: ClusterListQuery | undefined): ClusterListQuery {
  return filter || {}
}

async function resolveClusterIds(
  store: CrawlerStore,
  body: {
    ids?: string[]
    matchFilter?: boolean
    filter?: ClusterListQuery
  }
): Promise<{ ids: string[]; requested: number; error?: string; clusters?: NewsClusterRecord[] }> {
  if (body.matchFilter) {
    const listed = await store.listClusterIdsMatching(body.filter || {}, BULK_EVENT_CAP)
    if (listed.total > BULK_ID_CAP) {
      return { ids: [], requested: listed.total, error: CLUSTER_BULK_CAP_ERROR }
    }
    return { ids: listed.ids, requested: listed.total }
  }
  const ids = [...new Set((body.ids || []).map((id) => id.trim()).filter(Boolean))]
  if (ids.length > BULK_ID_CAP) return { ids: [], requested: ids.length, error: CLUSTER_BULK_CAP_ERROR }
  return { ids, requested: ids.length }
}

function articleAlready(status: CrawlerEditorialStatus, op: ArticleBulkOp): boolean {
  if (op === 'review') return status === 'IN_REVIEW'
  if (op === 'ai_candidate') return status === 'AI_CANDIDATE'
  if (op === 'reject') return status === 'REJECTED'
  if (op === 'archive') return status === 'ARCHIVED'
  if (op === 'delete') return status === 'DELETED'
  return false
}

async function articleHasRelations(store: CrawlerStore, article: RawArticleRecord): Promise<boolean> {
  if (article.clusterId) return true
  const membership = await store.getMembershipByArticle(article.id)
  if (membership) return true
  const media = await store.listArticleMedia(article.id)
  return media.length > 0
}

async function writeAudit(
  store: CrawlerStore,
  actor: BulkActor,
  action: string,
  entityType: 'raw_article' | 'cluster',
  opts: {
    result: BulkResult
    entityId?: string | null
    reason?: string | null
    note?: string | null
    previousState?: string | null
    newState?: string | null
    editorialPriority?: EditorialPriority | null
    selectionMode?: EditorialSelectionMode | null
  }
) {
  const row: CrawlerEditorialAuditRecord = {
    id: newCrawlerId('aud'),
    actorId: actor.uid,
    actorEmail: actor.email || null,
    actorRole: actor.role,
    action,
    entityType,
    entityId: opts.entityId ?? null,
    affectedCount: opts.result.affected,
    skippedCount: opts.result.skipped,
    failedCount: opts.result.failed,
    reason: opts.reason ?? null,
    note: opts.note ?? null,
    previousState: opts.previousState ?? null,
    newState: opts.newState ?? null,
    editorialPriority: opts.editorialPriority ?? null,
    selectionMode: opts.selectionMode ?? null,
    createdAt: new Date(),
  }
  await store.insertEditorialAudit(row)
}

export async function runArticleBulk(opts: {
  store: CrawlerStore
  actor: BulkActor
  op: ArticleBulkOp
  ids?: string[]
  matchFilter?: boolean
  filter?: RawArticleListQuery
  reason?: string | null
  note?: string | null
  selectionMode?: EditorialSelectionMode
}): Promise<BulkResult | { error: string; status: number }> {
  const action: CrawlerBulkAction = opts.op === 'delete' ? 'soft_delete' : opts.op === 'ai_candidate' ? 'ai_candidate' : opts.op
  const authz = authorizeCrawlerBulk(opts.actor.role, action)
  if (!authz.ok) return { error: authz.error, status: 403 }

  if (opts.op === 'reject') {
    const reason = parseRejectionReason(opts.reason)
    if (!reason) return { error: 'Red gerekçesi gerekli', status: 400 }
  }

  const resolved = await resolveArticleIds(opts.store, opts)
  if (resolved.error) return { error: resolved.error, status: 400 }
  const result = emptyResult(resolved.requested)
  const now = new Date()
  const selectionMode = parseSelectionMode(opts.selectionMode, Boolean(opts.matchFilter), resolved.ids.length)

  for (const id of resolved.ids) {
    try {
      const article = await opts.store.getRawArticle(id)
      if (!article) {
        skip(result, 'not_found')
        continue
      }
      if (LOCKED_ARTICLE.includes(article.editorialStatus) && opts.op !== 'delete') {
        skip(result, 'locked')
        continue
      }
      if (article.editorialStatus === 'PUBLISHED' && opts.op === 'delete') {
        skip(result, 'published')
        continue
      }
      if (articleAlready(article.editorialStatus, opts.op)) {
        skip(result, 'idempotent')
        continue
      }

      const previousState = article.editorialStatus
      let newState: CrawlerEditorialStatus = article.editorialStatus
      if (opts.op === 'review') {
        newState = 'IN_REVIEW'
        await opts.store.updateRawArticle(id, { editorialStatus: 'IN_REVIEW' })
      } else if (opts.op === 'ai_candidate') {
        newState = 'AI_CANDIDATE'
        await opts.store.updateRawArticle(id, { editorialStatus: 'AI_CANDIDATE' })
      } else if (opts.op === 'reject') {
        newState = 'REJECTED'
        await opts.store.updateRawArticle(id, {
          editorialStatus: 'REJECTED',
          rejectionReason: parseRejectionReason(opts.reason),
          rejectionNote: opts.note?.trim() || null,
          rejectedAt: now,
          rejectedBy: opts.actor.uid,
        })
      } else if (opts.op === 'archive') {
        newState = 'ARCHIVED'
        await opts.store.updateRawArticle(id, { editorialStatus: 'ARCHIVED' })
      } else {
        const relations = await articleHasRelations(opts.store, article)
        const hardAuth = authorizeCrawlerBulk(opts.actor.role, 'hard_delete')
        if (!relations && hardAuth.ok) {
          await opts.store.deleteRawArticle(id)
          result.affected += 1
          result.hardDeleted += 1
          await writeAudit(opts.store, opts.actor, opts.op, 'raw_article', {
            result: { ...result, affected: 1, skipped: 0, failed: 0 },
            entityId: id,
            reason: opts.reason,
            note: opts.note,
            previousState,
            newState: 'DELETED',
            selectionMode,
          })
          continue
        }
        newState = 'DELETED'
        await opts.store.updateRawArticle(id, { editorialStatus: 'DELETED' })
        result.tombstoned += 1
      }
      result.affected += 1
      await writeAudit(opts.store, opts.actor, opts.op, 'raw_article', {
        result: { ...result, affected: 1, skipped: 0, failed: 0 },
        entityId: id,
        reason: opts.reason,
        note: opts.note,
        previousState,
        newState,
        selectionMode,
      })
    } catch {
      result.failed += 1
    }
  }

  const gate = assertNoAiDispatch()
  result.aiRequests = gate.aiRequests
  result.dispatchEnabled = gate.dispatchEnabled
  await writeAudit(opts.store, opts.actor, opts.op, 'raw_article', {
    result,
    entityId: null,
    reason: opts.reason,
    note: opts.note,
    selectionMode,
  })
  return result
}

function clusterAlready(decision: ClusterEditorialDecision, op: ClusterBulkOp): boolean {
  if (op === 'approve_for_ai') return decision === 'APPROVED_FOR_AI'
  if (op === 'watch') return decision === 'WATCHING'
  if (op === 'reject') return decision === 'REJECTED'
  if (op === 'archive') return decision === 'ARCHIVED'
  if (op === 'restore') return decision === 'NONE'
  return false
}

function decisionFor(op: ClusterBulkOp): ClusterEditorialDecision {
  if (op === 'approve_for_ai') return 'APPROVED_FOR_AI'
  if (op === 'watch') return 'WATCHING'
  if (op === 'reject') return 'REJECTED'
  if (op === 'restore') return 'NONE'
  return 'ARCHIVED'
}

export async function runClusterBulk(opts: {
  store: CrawlerStore
  actor: BulkActor
  op: ClusterBulkOp
  ids?: string[]
  matchFilter?: boolean
  filter?: ClusterListQuery
  reason?: string | null
  note?: string | null
  editorialPriority?: EditorialPriority | string | null
  approvalSource?: ApprovalSource | string | null
  selectionMode?: EditorialSelectionMode
  confirmStale?: boolean
}): Promise<BulkResult | { error: string; status: number }> {
  const action: CrawlerBulkAction =
    opts.op === 'approve_for_ai'
      ? 'approve_for_ai'
      : opts.op === 'watch'
        ? 'watch'
        : opts.op === 'restore'
          ? 'restore'
          : opts.op
  const authz = authorizeCrawlerBulk(opts.actor.role, action)
  if (!authz.ok) return { error: authz.error, status: 403 }

  if (opts.op === 'reject') {
    const reason = parseRejectionReason(opts.reason)
    if (!reason) return { error: 'Red gerekçesi gerekli', status: 400 }
  }

  const resolved = await resolveClusterIds(opts.store, opts)
  if (resolved.error) return { error: resolved.error, status: 400 }
  const result = emptyResult(resolved.requested)
  const now = new Date()
  const decision = decisionFor(opts.op)
  const priority = parseEditorialPriority(opts.editorialPriority)
  const approvalSource = parseApprovalSource(
    opts.approvalSource,
    parseSelectionMode(opts.selectionMode, Boolean(opts.matchFilter), resolved.ids.length) === 'single'
      ? 'cms_single'
      : 'cms_bulk'
  )
  const selectionMode = parseSelectionMode(opts.selectionMode, Boolean(opts.matchFilter), resolved.ids.length)

  if (opts.op === 'approve_for_ai' && !opts.confirmStale) {
    for (const id of resolved.ids) {
      const cluster = resolved.clusters?.find((c) => c.id === id) || (await opts.store.getCluster(id))
      if (cluster && requiresStaleSecondConfirm(eventAgeHours(cluster, now))) {
        return { error: staleConfirmMessage(eventAgeHours(cluster, now)), status: 409 }
      }
    }
  }

  for (const id of resolved.ids) {
    try {
      const cluster = await opts.store.getCluster(id)
      if (!cluster) {
        skip(result, 'not_found')
        continue
      }
      if (clusterAlready(cluster.editorialDecision, opts.op)) {
        skip(result, 'idempotent')
        continue
      }
      if (opts.op === 'restore' && cluster.editorialDecision !== 'REJECTED' && cluster.editorialDecision !== 'ARCHIVED') {
        skip(result, 'not_restorable')
        continue
      }
      const algorithmicEligibility = cluster.aiEligibility
      const importanceScore = cluster.importanceScore
      const previousState = cluster.editorialDecision
      const patch: Partial<NewsClusterRecord> = {
        editorialDecision: decision,
        editorialDecisionReason:
          opts.op === 'reject' ? parseRejectionReason(opts.reason) : opts.op === 'restore' ? null : cluster.editorialDecisionReason,
        editorialDecisionNote: opts.op === 'restore' ? null : opts.note?.trim() || null,
        editorialDecidedAt: now,
        editorialDecidedBy: opts.actor.uid,
        aiEligibility: algorithmicEligibility,
        importanceScore,
      }
      if (opts.op === 'approve_for_ai') {
        patch.editorialPriority = priority
        patch.approvalSource = approvalSource
      }
      if (opts.op === 'restore') {
        patch.editorialPriority = 'NORMAL'
        patch.approvalSource = null
      }
      await opts.store.updateCluster(id, patch)
      const after = await opts.store.getCluster(id)
      if (after && after.aiEligibility !== algorithmicEligibility) {
        await opts.store.updateCluster(id, { aiEligibility: algorithmicEligibility })
      }
      if (after && after.importanceScore !== importanceScore) {
        await opts.store.updateCluster(id, { importanceScore })
      }
      result.affected += 1
      await writeAudit(opts.store, opts.actor, opts.op, 'cluster', {
        result: { ...result, affected: 1, skipped: 0, failed: 0 },
        entityId: id,
        reason: opts.reason,
        note: opts.note,
        previousState,
        newState: decision,
        editorialPriority: opts.op === 'approve_for_ai' ? priority : cluster.editorialPriority,
        selectionMode,
      })
    } catch {
      result.failed += 1
    }
  }

  const gate = assertNoAiDispatch()
  result.aiRequests = gate.aiRequests
  result.dispatchEnabled = gate.dispatchEnabled
  await writeAudit(opts.store, opts.actor, opts.op, 'cluster', {
    result,
    entityId: null,
    reason: opts.reason,
    note: opts.note,
    newState: decision,
    editorialPriority: opts.op === 'approve_for_ai' ? priority : null,
    selectionMode,
  })
  return result
}

export function matchingArticleIds(articles: RawArticleRecord[], query: RawArticleListQuery, cap = FILTER_MATCH_CAP) {
  const ids = articles.filter((a) => matchesRawArticleQuery(a, query)).map((a) => a.id)
  return { total: ids.length, ids: ids.slice(0, cap) }
}

export function matchingClusterIds(clusters: NewsClusterRecord[], query: ClusterListQuery) {
  const ids = clusters.filter((c) => matchesClusterQuery(c, query)).map((c) => c.id)
  return { total: ids.length, ids }
}

export function clusterEditorialCounts(clusters: NewsClusterRecord[]) {
  const approvedForAi = clusters.filter((c) => c.editorialDecision === 'APPROVED_FOR_AI').length
  const editorRejected = clusters.filter((c) => c.editorialDecision === 'REJECTED').length
  const archived = clusters.filter((c) => c.editorialDecision === 'ARCHIVED').length
  return { approvedForAi, editorRejected, archived }
}

export function articleEditorialCounts(articles: RawArticleRecord[]) {
  const inReview = articles.filter((a) => a.editorialStatus === 'IN_REVIEW').length
  const rejected = articles.filter((a) => a.editorialStatus === 'REJECTED').length
  const archived = articles.filter((a) => a.editorialStatus === 'ARCHIVED').length
  const aiCandidate = articles.filter((a) => a.editorialStatus === 'AI_CANDIDATE').length
  return { inReview, rejected, archived, aiCandidate }
}

export function isBulkError(value: BulkResult | { error: string; status: number }): value is { error: string; status: number } {
  return 'error' in value
}
