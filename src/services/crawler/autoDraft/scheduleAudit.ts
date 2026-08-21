/**
 * Phase 4E — local schedule audit from vercel.json cron config.
 * Expected frequencies from config (not live prod timestamps).
 */

export type ScheduleAuditRow = {
  path: string
  schedule: string
  expectedFrequencyTr: string
  role: 'rss_or_newsroom' | 'crawler' | 'extraction_cluster' | 'ai_worker' | 'other'
}

function describeCron(schedule: string): string {
  if (schedule === '* * * * *') return 'Her dakika'
  if (schedule === '*/2 * * * *') return 'Her 2 dakika'
  if (schedule === '*/5 * * * *') return 'Her 5 dakika'
  if (schedule === '*/20 * * * *') return 'Her 20 dakika'
  if (/^\d+ \*\/1 \* \* \*$/.test(schedule) || schedule === '0 */1 * * *') return 'Saatte bir'
  if (/^\d+ \* \* \* \*$/.test(schedule)) return 'Saatte bir (dakika ofsetli)'
  if (/^\d+ \*\/2 \* \* \*$/.test(schedule)) return '2 saatte bir'
  if (/^\d+ \*\/4 \* \* \*$/.test(schedule)) return '4 saatte bir'
  if (/^\d+ \*\/6 \* \* \*$/.test(schedule)) return '6 saatte bir'
  return schedule
}

function classify(path: string): ScheduleAuditRow['role'] {
  if (path.includes('crawler-ai-worker')) return 'ai_worker'
  if (path.includes('/cron/crawler/tick')) return 'crawler'
  if (path.includes('/cron/crawler')) return 'extraction_cluster'
  if (path.includes('newsroom') || path.includes('rss') || path.includes('afad')) return 'rss_or_newsroom'
  return 'other'
}

export function auditCronSchedules(
  crons: Array<{ path: string; schedule: string }>
): ScheduleAuditRow[] {
  return crons.map((c) => ({
    path: c.path,
    schedule: c.schedule,
    expectedFrequencyTr: describeCron(c.schedule),
    role: classify(c.path),
  }))
}

export function phase4eFreshnessExpectations(crons: Array<{ path: string; schedule: string }>) {
  const rows = auditCronSchedules(crons)
  const crawler = rows.find((r) => r.path.includes('/cron/crawler/tick'))
  const aiWorker = rows.find((r) => r.path.includes('crawler-ai-worker'))
  return {
    rssDiscovery: 'Kaynak cadence’ine bağlı; newsroom RSS crons çoğunlukla 20dk–2s',
    crawlerDiscovery: crawler?.expectedFrequencyTr || 'Yapılandırılmamış',
    fetchExtraction: 'Crawler tick içinde (discovery sonrası kısa süre)',
    clustering: 'Crawler tick içinde (extract sonrası)',
    aiWorker: aiWorker?.expectedFrequencyTr || 'Yapılandırılmamış',
    targetOperationalTr:
      'Yeni URL’ler kaynak cadence izin verdiğinde ~1–5 dk; extract ve olay dakikalar içinde newsroom’da',
    rows,
  }
}
