/**
 * 2026 FIFA Dünya Kupası Worker — ARCHIVE MODE
 *
 * Turnuva 19 Temmuz 2026'da bitti. Yeni ingest kapalı; kategori arşiv sayfası
 * olarak kalır. Yeni dünya futbolu haberleri `futbol` worker / categoryEngine
 * üzerinden `futbol` kategorisine gider.
 */
import { emptyNewsroomResult, type NewsroomRunResult } from '@/services/newsroom/types'

/** Post-tournament: no new WC ingest. Flip to true only if a future WC cycle needs it. */
export const WORLD_CUP_2026_INGEST_ENABLED = false

export async function runWorldCupWorker(): Promise<NewsroomRunResult> {
  if (!WORLD_CUP_2026_INGEST_ENABLED) {
    console.log('[world-cup-2026] ingest disabled (post-tournament archive mode)')
    return emptyNewsroomResult('world-cup-2026')
  }

  // Legacy path kept for optional re-enable during a future tournament.
  const { runRssEditor } = await import('@/services/newsroom/rssEditor')
  return runRssEditor({
    sourceIds: [
      'sozcu-world-cup',
      'gnews-world-cup-tr',
      'gnews-milli-takim-wc',
      'gnews-world-cup-results',
    ],
    editorId: 'world-cup-2026',
    editorType: 'national',
    maxAiCalls: 12,
    maxItemsPerSource: 4,
    forcedCategoryId: 'dunya-kupasi-2026',
    enrichInput: () => ({
      extraTags: ['2026', 'dünya-kupası', 'fifa', 'world-cup', 'futbol', 'milli-takım'],
    }),
  })
}
