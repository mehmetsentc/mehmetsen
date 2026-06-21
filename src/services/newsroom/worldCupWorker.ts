/**
 * 2026 FIFA Dünya Kupası Worker
 * Kaynak: Sözcü — sadece dunya-kupasi-2026 kategorisine kaydeder, başka yere düşmez.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runWorldCupWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-world-cup'],
    editorId: 'world-cup-2026',
    editorType: 'national',
    maxAiCalls: 10,
    forcedCategoryId: 'dunya-kupasi-2026',
    enrichInput: () => ({
      extraTags: ['2026', 'dünya-kupası', 'fifa', 'world-cup', 'futbol', 'milli-takım'],
    }),
  })
}
