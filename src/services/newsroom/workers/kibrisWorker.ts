import { KIBRIS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Kıbrıs / KKTC haberleri worker.
 * Kaynaklar: Kıbrıs Gazetesi, Yeni Düzen, Havadis, Kıbrıs Postası,
 * Bugün Kıbrıs, Detay Kıbrıs, Son Dakika Cyprus, Kıbrıs Gerçek,
 * Gündem Kıbrıs, Haber Kıbrıs, KKTC Polis ve Google News aramaları.
 * Tüm haberler kibris-haberleri kategorisine yayınlanır.
 * Cron: her 30 dakikada bir.
 */
export async function runKibrisWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'kibris-haberleri',
    editorType: 'national',
    sourceIds: [...KIBRIS_SOURCE_IDS],
    forcedCategoryId: 'kibris-haberleri',
    enrichInput: (_item, _source) => ({
      extraTags: ['kıbrıs', 'kktc', 'lefkoşa', 'kuzey kıbrıs'],
    }),
  })
}
