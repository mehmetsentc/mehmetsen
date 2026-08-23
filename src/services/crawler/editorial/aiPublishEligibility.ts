import type { CrawlerEditorialStatus } from '../types'

/** Ham Haberler satır / toplu AI yayın — PUBLISHED ve DELETED hariç. Client-safe. */
export function isRawArticleAiPublishEligible(status: CrawlerEditorialStatus): boolean {
  return status !== 'PUBLISHED' && status !== 'DELETED'
}

/** Client + server — wall-clock budget skip message (must stay in sync with aiPublish). */
export const AI_PUBLISH_TIMEOUT_SKIP_TR =
  'Süre doldu — bu haber işlenmedi. Kalan seçimi yeniden onaylayın.'
