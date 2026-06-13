import { OTOMOBIL_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Otomobil worker — Oto.com.tr, OtomobilHaber, Arabalar.com.tr,
 * Hürriyet Otomobil, Milliyet Otomobil, Google News araç aramaları.
 * Covers: yeni model tanıtımları, fiyat listeleri, kampanyalar,
 * elektrikli araçlar, TOGG, trafik ve sürücü haberleri.
 * Cron: every 30 min.
 */
export async function runOtomobilWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'otomobil-news',
    editorType: 'national',
    sourceIds: [...OTOMOBIL_SOURCE_IDS],
    forcedCategoryId: 'otomobil',
    enrichInput: (_item, _source) => ({
      extraTags: ['otomobil', 'araç', 'araba'],
    }),
  })
}
