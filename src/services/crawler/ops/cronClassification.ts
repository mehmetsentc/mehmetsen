export const CRON_CLASS_A = 'feed_crawler_discovery' as const
export const CRON_CLASS_B = 'structured_non_article' as const
export const CRON_CLASS_C = 'legacy_safely_disabled' as const
export const CRON_CLASS_D = 'future_migration' as const

export type CronAuditClass = typeof CRON_CLASS_A | typeof CRON_CLASS_B | typeof CRON_CLASS_C | typeof CRON_CLASS_D

export interface CronAuditRow {
  path: string
  class: CronAuditClass
  note: string
}

/** Article RSS/news crons become cheap discovery radar. Structured jobs stay structured. */
export const CRON_PATH_AUDIT: CronAuditRow[] = [
  { path: '/api/cron/crawler/tick', class: CRON_CLASS_A, note: 'Crawler discovery + full extraction + clustering' },
  { path: '/api/cron/newsroom/breaking', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/local', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/national', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/gundem', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/finans', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/politics', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/sports', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/world', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/technology', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/kripto', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/health', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/entertainment', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/magazine', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/gastronomi', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/turizm', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/gezi', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/otomobil', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/sinema', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/bilim-teknoloji', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/kibris', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/freenews', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/aa-content', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/anka-breaking', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/anka-local', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/sozcu-breaking', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/saglik-sozcu', class: CRON_CLASS_A, note: 'Legacy RSS discovery adapter' },
  { path: '/api/cron/newsroom/canakkale-bel-duyuru', class: CRON_CLASS_A, note: 'Public notices via discovery adapter' },
  { path: '/api/cron/newsroom/afad', class: CRON_CLASS_A, note: 'AFAD alerts via discovery adapter' },
  { path: '/api/cron/newsroom/weather', class: CRON_CLASS_B, note: 'Weather structured data — not article scraping' },
  { path: '/api/cron/weather-news', class: CRON_CLASS_B, note: 'Weather structured data — not article scraping' },
  { path: '/api/cron/newsroom/futbol', class: CRON_CLASS_B, note: 'Football scores — not article scraping' },
  { path: '/api/cron/newsroom/basketbol', class: CRON_CLASS_B, note: 'Basketball scores — not article scraping' },
  { path: '/api/cron/newsroom/voleybol', class: CRON_CLASS_B, note: 'Volleyball scores — not article scraping' },
  { path: '/api/cron/football-sync', class: CRON_CLASS_B, note: 'Football fixture sync' },
  { path: '/api/cron/skor-live', class: CRON_CLASS_B, note: 'Live scores' },
  { path: '/api/cron/skor-daily', class: CRON_CLASS_B, note: 'Daily scores' },
  { path: '/api/cron/skor-standings', class: CRON_CLASS_B, note: 'Standings' },
  { path: '/api/cron/canakkale-nobetci-eczane', class: CRON_CLASS_B, note: 'Pharmacy on-duty data' },
  { path: '/api/cron/antalya-nobetci-eczane', class: CRON_CLASS_B, note: 'Pharmacy on-duty data' },
  { path: '/api/cron/iskur-jobs', class: CRON_CLASS_B, note: 'İŞKUR listings' },
  { path: '/api/events/sync', class: CRON_CLASS_B, note: 'Ticket/event structured sync' },
  { path: '/api/cron/paribu-canakkale', class: CRON_CLASS_B, note: 'Cinema showtimes' },
  { path: '/api/cron/boxoffice-weekly', class: CRON_CLASS_B, note: 'Box office structured data' },
  { path: '/api/cron/on-this-day', class: CRON_CLASS_B, note: 'On-this-day structured content' },
  { path: '/api/cron/newsroom/borsa', class: CRON_CLASS_B, note: 'Markets structured data' },
  { path: '/api/cron/youtube-rss', class: CRON_CLASS_B, note: 'Video RSS, not article body extraction' },
  { path: '/api/cron/social', class: CRON_CLASS_B, note: 'Social republish, not discovery' },
  { path: '/api/cron/newsroom/ai-pipeline', class: CRON_CLASS_C, note: 'Legacy newsroom AI — direct AI blocked' },
  { path: '/api/cron/newsroom/ai-columns', class: CRON_CLASS_C, note: 'Legacy columns AI — direct AI blocked' },
  { path: '/api/cron/newsroom/process-queue', class: CRON_CLASS_C, note: 'Queue drain skipped unless LEGACY_DIRECT_AI_ENABLED' },
  { path: '/api/cron/newsroom/draft-reprocess', class: CRON_CLASS_C, note: 'Draft reprocess — AI blocked in this phase' },
  { path: '/api/cron/newsroom/queue-purge', class: CRON_CLASS_C, note: 'Queue maintenance, no article scrape' },
  { path: '/api/cron/newsroom/expire-breaking', class: CRON_CLASS_C, note: 'Breaking expiry maintenance' },
  { path: '/api/cron/newsroom/thin-content-backfill', class: CRON_CLASS_C, note: 'Legacy thin backfill — not 4A.4 extraction' },
  { path: '/api/cron/newsroom/seo', class: CRON_CLASS_C, note: 'SEO maintenance' },
  { path: '/api/cron/newsroom/archive', class: CRON_CLASS_C, note: 'Archive worker' },
  { path: '/api/cron/newsroom/trend', class: CRON_CLASS_D, note: 'Trend worker may later share URL inbox' },
  { path: '/api/cron/newsroom/influencer', class: CRON_CLASS_D, note: 'Influencer ingest — future migration' },
  { path: '/api/cron/newsroom/video-process', class: CRON_CLASS_D, note: 'Video pipeline — not article events' },
  { path: '/api/cron/newsroom/video-queue', class: CRON_CLASS_D, note: 'Video queue — not article events' },
  { path: '/api/cron/editorial-review', class: CRON_CLASS_D, note: 'Editorial review cron — keep separate' },
  { path: '/api/admin/recategorize', class: CRON_CLASS_D, note: 'Admin recategorize, not discovery' },
]

export function classifyCronPath(path: string): CronAuditRow | null {
  return CRON_PATH_AUDIT.find((row) => row.path === path) || null
}

export function cronAuditByClass(): Record<CronAuditClass, CronAuditRow[]> {
  return {
    [CRON_CLASS_A]: CRON_PATH_AUDIT.filter((r) => r.class === CRON_CLASS_A),
    [CRON_CLASS_B]: CRON_PATH_AUDIT.filter((r) => r.class === CRON_CLASS_B),
    [CRON_CLASS_C]: CRON_PATH_AUDIT.filter((r) => r.class === CRON_CLASS_C),
    [CRON_CLASS_D]: CRON_PATH_AUDIT.filter((r) => r.class === CRON_CLASS_D),
  }
}
