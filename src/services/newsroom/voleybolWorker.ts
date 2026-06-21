/**
 * Voleybol Worker
 * Kaynak: Sözcü — sadece voleybol kategorisine kaydeder.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runVoleybolWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-voleybol'],
    editorId: 'voleybol',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'voleybol',
    enrichInput: () => ({
      extraTags: ['voleybol', 'efeler-ligi', 'sultanlar-ligi', 'spor'],
    }),
  })
}
