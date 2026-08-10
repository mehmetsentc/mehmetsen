import { SINEMA_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { BOX_OFFICE_ATTRIBUTION } from '@/services/boxOfficeTurkiyeService'

/**
 * Sinema worker — Box Office Türkiye Atom feed.
 * forcedCategoryId: sinema; attribution via RSS source label.
 * Cron: every 4h (vercel.json).
 */
export async function runSinemaWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'sinema-news',
    editorType: 'national',
    sourceIds: [...SINEMA_SOURCE_IDS],
    forcedCategoryId: 'sinema',
    enrichInput: () => ({
      extraTags: ['sinema', 'film', 'vizyon', 'gişe'],
      sourceLabel: BOX_OFFICE_ATTRIBUTION,
    }),
  })
}
