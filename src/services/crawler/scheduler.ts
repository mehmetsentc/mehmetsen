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
}): DiscoveredUrlRecord[] {
  const buckets = new Map<string, DiscoveredUrlRecord[]>()
  for (const item of opts.pending) {
    const list = buckets.get(item.sourceId) || []
    list.push(item)
    buckets.set(item.sourceId, list)
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.discoveredAt.getTime() - b.discoveredAt.getTime())
  }

  const sourceIds = [...buckets.keys()].sort((a, b) => {
    const pa = opts.sources.get(a)?.priority ?? 0
    const pb = opts.sources.get(b)?.priority ?? 0
    return pb - pa
  })

  const taken = new Map<string, number>()
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
      while (gave < quotaThisRound && bucket.length && out.length < opts.limit && already + gave < opts.maxPerSource) {
        const next = bucket.shift()
        if (!next) break
        out.push(next)
        gave += 1
        progressed = true
      }
      if (gave) taken.set(sourceId, already + gave)
    }
  }
  return out
}
