import type { CrawlerLogFields } from './types'

/** Structured crawler logs. Never include article body. */
export function logCrawler(fields: CrawlerLogFields, extra?: Record<string, string | number | boolean | null>) {
  const payload = {
    subsystem: 'news-crawler',
    ...fields,
    ...extra,
  }
  if (fields.errorCode) {
    console.warn('[crawler]', JSON.stringify(payload))
    return
  }
  console.log('[crawler]', JSON.stringify(payload))
}
