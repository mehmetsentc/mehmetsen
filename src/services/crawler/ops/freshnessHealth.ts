export type FreshnessHealthStatus = 'GÜNCEL' | 'GECİKİYOR' | 'KRİTİK'

export interface FreshnessHealthInput {
  now?: Date
  lastDiscoveryAt: Date | string | null
  lastFullScrapeAt: Date | string | null
  lastClusterAt: Date | string | null
  pendingFetch: number
  oldestPendingAt: Date | string | null
  newUrlsLast15m: number
  fullScrapesLast15m: number
  eventsLast15m: number
  /** Publisher activity available in the last hour (discovered or published hint). */
  sourceActivityLastHour: number
}

export interface FreshnessHealthSnapshot {
  status: FreshnessHealthStatus
  sonHaberKesfi: string | null
  sonFullScrape: string | null
  sonKumeleme: string | null
  bekleyenUrl: number
  enEskiBekleyen: string | null
  son15dkYeniUrl: number
  son15dkFullScrape: number
  son15dkOlustanOlay: number
  reason: string
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

function iso(v: Date | null): string | null {
  return v ? v.toISOString() : null
}

function ageMs(now: Date, v: Date | null): number | null {
  if (!v) return null
  return Math.max(0, now.getTime() - v.getTime())
}

/**
 * Freshness health must not mark KRİTİK merely because publishers are quiet.
 * When sourceActivityLastHour=0 and queues are empty, stay GÜNCEL/GECİKİYOR.
 */
export function computeFreshnessHealth(input: FreshnessHealthInput): FreshnessHealthSnapshot {
  const now = input.now ?? new Date()
  const lastDiscoveryAt = toDate(input.lastDiscoveryAt)
  const lastFullScrapeAt = toDate(input.lastFullScrapeAt)
  const lastClusterAt = toDate(input.lastClusterAt)
  const oldestPendingAt = toDate(input.oldestPendingAt)

  const discoveryAge = ageMs(now, lastDiscoveryAt)
  const scrapeAge = ageMs(now, lastFullScrapeAt)
  const clusterAge = ageMs(now, lastClusterAt)
  const oldestPendingAge = ageMs(now, oldestPendingAt)

  const activeSourcesPublishing = input.sourceActivityLastHour > 0
  const backlogStuck =
    input.pendingFetch > 0 && oldestPendingAge != null && oldestPendingAge > 45 * 60_000
  const pipelineStalled =
    activeSourcesPublishing &&
    ((discoveryAge != null && discoveryAge > 30 * 60_000) ||
      (scrapeAge != null && scrapeAge > 45 * 60_000) ||
      (input.pendingFetch > 40 && (input.fullScrapesLast15m || 0) === 0))

  let status: FreshnessHealthStatus = 'GÜNCEL'
  let reason = 'Keşif/çıkarım/kümeleme dakikalar içinde güncel'

  if (pipelineStalled || (backlogStuck && activeSourcesPublishing && input.fullScrapesLast15m === 0)) {
    status = 'KRİTİK'
    reason = 'Kaynak aktivitesi var ama üretim hattı ilerlemıyor'
  } else if (
    backlogStuck ||
    (discoveryAge != null && discoveryAge > 15 * 60_000 && activeSourcesPublishing) ||
    (scrapeAge != null && scrapeAge > 20 * 60_000 && input.pendingFetch > 20)
  ) {
    status = 'GECİKİYOR'
    reason = 'Bekleyen kuyruk veya keşif gecikmesi var'
  } else if (!activeSourcesPublishing && input.pendingFetch === 0) {
    status = 'GÜNCEL'
    reason = 'Kaynaklarda yeni haber yok; hat sağlıklı bekliyor'
  }

  return {
    status,
    sonHaberKesfi: iso(lastDiscoveryAt),
    sonFullScrape: iso(lastFullScrapeAt),
    sonKumeleme: iso(lastClusterAt),
    bekleyenUrl: input.pendingFetch,
    enEskiBekleyen: iso(oldestPendingAt),
    son15dkYeniUrl: input.newUrlsLast15m,
    son15dkFullScrape: input.fullScrapesLast15m,
    son15dkOlustanOlay: input.eventsLast15m,
    reason,
  }
}
