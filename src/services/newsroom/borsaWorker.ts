/**
 * Borsa Worker
 * Kaynak: Sözcü — sadece borsa kategorisine kaydeder.
 * Ana feed veya gündem'e düşmez.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runBorsaWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-borsa'],
    editorId: 'borsa',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'borsa',
    enrichInput: () => ({
      extraTags: ['borsa', 'bist', 'hisse', 'endeks', 'ekonomi'],
    }),
  })
}
