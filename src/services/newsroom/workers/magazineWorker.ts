import { MAGAZINE_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Magazine worker — Milliyet Magazin, Posta, Hürriyet Magazin, Takvim Magazin,
 * Variety, Billboard, TMZ, Hollywood Reporter.
 * Covers: celebrities, entertainment, TV, cinema, music, pop culture.
 * Cron: every 15 min.
 */
export async function runMagazineWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'magazine-news',
    editorType: 'national',
    sourceIds: MAGAZINE_NEWS_SOURCE_IDS,
    forcedCategoryId: 'magazin',
    enrichInput: () => ({
      extraTags: ['magazin', 'eğlence', 'ünlüler', 'sinema', 'müzik'],
    }),
  })
}
