import type { CrawlerEditorialStatus } from '../types'

/** Ham Haberler satır / toplu AI yayın — PUBLISHED ve DELETED hariç. Client-safe. */
export function isRawArticleAiPublishEligible(status: CrawlerEditorialStatus): boolean {
  return status !== 'PUBLISHED' && status !== 'DELETED'
}
