/**
 * Çanakkale belediye duyuru scraper — günde 2 kez.
 * Son 12 saatteki duyuruları yerel-duyuru olarak kuyruğa alır.
 */
import { getEnabledCanakkaleBelDuyuruSources } from '@/services/newsroom/sources/canakkaleBelDuyuruSources'
import { runScraperSources } from '@/services/newsroom/workers/scraperWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export async function runCanakkaleBelDuyuruWorker(): Promise<NewsroomRunResult> {
  const sources = getEnabledCanakkaleBelDuyuruSources()
  if (sources.length === 0) {
    const empty = emptyNewsroomResult('local-news')
    empty.errors.push('[canakkale-bel-duyuru] no enabled sources')
    return empty
  }

  console.log(`[canakkale-bel-duyuru] starting ${sources.length} municipality sources`)
  const result = await runScraperSources(sources)
  result.workerId = 'canakkale-bel-duyuru'
  console.log(
    `[canakkale-bel-duyuru] done fetched=${result.itemsFetched} queued=${result.itemsNew} failed=${result.itemsFailed}`
  )
  return result
}
