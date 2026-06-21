/**
 * Sağlık Worker (Sözcü)
 * Sadece sağlık kategorisine kaydeder. Ana feed'e düşmez.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runSaglikSozcuWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-saglik'],
    editorId: 'saglik-sozcu',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'saglik',
    enrichInput: () => ({
      extraTags: ['sağlık', 'tıp', 'hastalık', 'tedavi', 'ilaç', 'beslenme'],
    }),
  })
}
