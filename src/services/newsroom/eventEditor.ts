/**
 * Event Editor — wraps the existing eventSyncService daily sync.
 */
import { eventSyncService } from '@/services/eventSyncService'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

export const eventEditor = {
  async run(): Promise<NewsroomRunResult & { eventSync: Awaited<ReturnType<typeof eventSyncService.syncEvents>> }> {
    const started = Date.now()
    const base = emptyNewsroomResult('event')

    try {
      const eventSync = await eventSyncService.syncEvents()
      return {
        ...base,
        sourcesChecked: eventSync.providers.length,
        itemsFetched: eventSync.scraped,
        itemsNew: eventSync.inserted,
        itemsSkipped: eventSync.skipped,
        durationMs: Date.now() - started,
        eventSync,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return {
        ...base,
        itemsFailed: 1,
        errors: [msg],
        durationMs: Date.now() - started,
        eventSync: {
          providers: [],
          citiesScanned: 0,
          scraped: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          markedPast: 0,
          markedRemoved: 0,
          failedProviders: [],
          completedAt: new Date().toISOString(),
          durationMs: 0,
        },
      }
    }
  },
}
