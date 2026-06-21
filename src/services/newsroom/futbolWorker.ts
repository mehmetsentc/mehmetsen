/**
 * Futbol Worker (Sözcü Dünyadan Spor)
 * Kaynak: Sözcü — sadece futbol kategorisine kaydeder.
 * Ana feed veya son-dakikaya düşmez.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runFutbolWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-dunyadan-spor'],
    editorId: 'futbol-sozcu',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'futbol',
    enrichInput: () => ({
      extraTags: ['futbol', 'dünya-futbolu', 'şampiyonlar-ligi', 'spor'],
    }),
  })
}
