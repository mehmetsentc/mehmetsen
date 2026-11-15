import type { CrawlPriorityBand, DiscoveredUrlRecord, NewsSourceRecord } from './types'

function weightFor(band: CrawlPriorityBand | undefined): number {
  if (band === 'BREAKING') return 3
  if (band === 'HIGH') return 2
  return 1
}

/**
 * Round-robin with light priority weighting. LOW still gets a slot each cycle
 * so it cannot starve behind BREAKING/HIGH.
 */
export function pickFairPending(opts: {
  pending: DiscoveredUrlRecord[]
  sources: Map<string, NewsSourceRecord>
  limit: number
  maxPerSource: number
  /**
   * SONDAKIKA-81: domain başına tur kotası. Tek domain'e ait çok sayıda kaynak
   * (sondakika.com'un 81 il kaynağı) kaynak-bazlı round-robin'de turun tamamını
   * almasın diye. Listede olmayan domain'ler sınırsız (önceki davranış).
   */
  maxPerDomain?: ReadonlyMap<string, number>
}): DiscoveredUrlRecord[] {
  const buckets = new Map<string, DiscoveredUrlRecord[]>()
  for (const item of opts.pending) {
    const list = buckets.get(item.sourceId) || []
    list.push(item)
    buckets.set(item.sourceId, list)
  }
  for (const list of buckets.values()) {
    // Newest first. A multi-thousand pending backlog must not hide this hour's URLs.
    list.sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime())
  }

  const sourceIds = [...buckets.keys()].sort((a, b) => {
    const pa = opts.sources.get(a)?.priority ?? 0
    const pb = opts.sources.get(b)?.priority ?? 0
    return pb - pa
  })

  const taken = new Map<string, number>()
  const takenByDomain = new Map<string, number>()
  const domainOf = (sourceId: string) =>
    (opts.sources.get(sourceId)?.domain || '').toLowerCase().replace(/^www\./, '')
  const domainRoom = (sourceId: string) => {
    const cap = opts.maxPerDomain?.get(domainOf(sourceId))
    return cap === undefined ? Number.POSITIVE_INFINITY : cap - (takenByDomain.get(domainOf(sourceId)) ?? 0)
  }
  const out: DiscoveredUrlRecord[] = []
  let progressed = true
  while (out.length < opts.limit && progressed) {
    progressed = false
    for (const sourceId of sourceIds) {
      const already = taken.get(sourceId) ?? 0
      if (already >= opts.maxPerSource) continue
      const band = opts.sources.get(sourceId)?.crawlPriority
      const quotaThisRound = Math.min(weightFor(band), opts.maxPerSource - already)
      const bucket = buckets.get(sourceId) || []
      let gave = 0
      while (
        gave < quotaThisRound &&
        bucket.length &&
        out.length < opts.limit &&
        already + gave < opts.maxPerSource &&
        domainRoom(sourceId) > 0
      ) {
        const next = bucket.shift()
        if (!next) break
        out.push(next)
        gave += 1
        progressed = true
        const d = domainOf(sourceId)
        if (opts.maxPerDomain?.has(d)) takenByDomain.set(d, (takenByDomain.get(d) ?? 0) + 1)
      }
      if (gave) taken.set(sourceId, already + gave)
    }
  }
  return out
}
