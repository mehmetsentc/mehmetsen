import type { CrawlerEditorialStatus } from '../types'
import type { CrawlerStore } from '../store/types'

export interface CleanupDryRunReport {
  dryRun: true
  executed: false
  rawToDelete: number
  clustersAffected: number
  mediaRelations: number
  publishedPreserved: number
  cmsNewsPreserved: number
  auditPreserved: number
  skippedStatuses: Record<string, number>
  notes: string[]
}

const PRESERVE: CrawlerEditorialStatus[] = ['PUBLISHED']

export async function previewBacklogCleanup(store: CrawlerStore): Promise<CleanupDryRunReport> {
  const articles = await store.listRawArticlesPage({ page: 1, pageSize: 25, queue: 'all' })
  const statuses = await store.countEditorialStatuses()
  const publishedPreserved = statuses.PUBLISHED || 0
  let cmsNewsPreserved = 0
  const all = await store.listRawArticleIds({ queue: 'all' }, 10_000)
  const skippedStatuses: Record<string, number> = { PUBLISHED: publishedPreserved }
  let rawToDelete = 0
  const clusterIds = new Set<string>()
  let mediaRelations = 0

  for (const id of all.ids) {
    const article = await store.getRawArticle(id)
    if (!article) continue
    if (PRESERVE.includes(article.editorialStatus) || article.editorialNewsId) {
      if (article.editorialNewsId) cmsNewsPreserved += 1
      continue
    }
    rawToDelete += 1
    if (article.clusterId) clusterIds.add(article.clusterId)
    mediaRelations += (await store.listArticleMedia(article.id)).length
  }

  const audits = await store.listEditorialAudits(500)

  return {
    dryRun: true,
    executed: false,
    rawToDelete,
    clustersAffected: clusterIds.size,
    mediaRelations,
    publishedPreserved,
    cmsNewsPreserved,
    auditPreserved: audits.length,
    skippedStatuses,
    notes: [
      'PUBLISHED raw articles are never included.',
      'CMS news rows linked via editorialNewsId are never deleted.',
      'Editorial audit rows are preserved.',
      'This report does not delete anything.',
      `Inbox sample total=${articles.total}`,
    ],
  }
}

export interface RescrapePlan {
  windowHours: 24
  sources: 'ACTIVE'
  aiRequests: 0
  publish: 0
  executed: false
  notes: string[]
}

export function describeRescrapePlan(): RescrapePlan {
  return {
    windowHours: 24,
    sources: 'ACTIVE',
    aiRequests: 0,
    publish: 0,
    executed: false,
    notes: [
      'After image extraction is production-verified, rescrape last 24h from ACTIVE sources only.',
      'AI dispatch remains closed (0 provider calls).',
      'Auto-publish remains closed.',
      'This task does not execute rescrape.',
    ],
  }
}
