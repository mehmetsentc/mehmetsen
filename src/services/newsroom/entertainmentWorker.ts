/**
 * Entertainment Worker — Magazin, eğlence, kültür-sanat ve spor haberleri.
 * Çalışma sıklığı: saatte bir (1hr cron).
 * Sources: Milliyet Magazin, Sabah Magazin, Posta, NTV Spor, Hürriyet Spor,
 *          NTV Kültür, Habertürk Spor
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export const ENTERTAINMENT_SOURCE_IDS = [
  'milliyet-magazin',
  'sabah-magazin',
  'posta-magazin',
  'ntv-spor',
  'hurriyet-spor',
  'ntv-kultur',
  'haberturk-spor',
] as const

export async function runEntertainmentWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: [...ENTERTAINMENT_SOURCE_IDS],
    editorId: 'entertainment',
    editorType: 'national',
    maxAiCalls: 10,
    // Let AI decide between spor, magazin, kultur categories
    enrichInput: () => ({
      extraTags: ['eglence', 'magazin', 'kultur', 'spor'],
    }),
  })
}
