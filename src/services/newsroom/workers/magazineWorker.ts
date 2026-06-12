import { MAGAZINE_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Magazine worker — Milliyet Magazin, Posta, Hürriyet Magazin, Takvim Magazin,
 * Variety, Billboard, TMZ, Hollywood Reporter.
 * Covers: celebrities, entertainment, TV, cinema, music, pop culture.
 * Cron: every 30 min.
 *
 * NOTE: No forcedCategoryId. These sources occasionally publish local/gündem news
 * (e.g. "Antalya sahilde şemsiye yasağı" from Milliyet Magazin RSS). Forcing
 * 'magazin' injected "ZORUNLU KATEGORİ: magazin" into the Gemini prompt which
 * overrode content analysis. Let Gemini + aiCategoryClassifier decide correctly.
 */
export async function runMagazineWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'magazine-news',
    editorType: 'national',
    sourceIds: MAGAZINE_NEWS_SOURCE_IDS,
    enrichInput: () => ({
      extraTags: ['eğlence', 'ünlüler'],
    }),
  })
}
