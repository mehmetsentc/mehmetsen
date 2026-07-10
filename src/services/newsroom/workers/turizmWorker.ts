import { TURIZM_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Turizm worker — Turizm Gazetesi, Turizm Aktüel, AA Turizm,
 * Hürriyet/NTV/Sabah Seyahat, Google News turizm aramaları.
 * Covers: otel açılışları, tatil sezonları, tur operatörü haberleri,
 * havalimanı istatistikleri, ziyaretçi rakamları, TÜRSAB kararları.
 * Cron: every 30 min.
 */
export async function runTurizmWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'turizm-news',
    editorType: 'national',
    sourceIds: [...TURIZM_SOURCE_IDS],
    forcedCategoryId: 'turizm',
    enrichInput: (_item, _source) => ({
      extraTags: ['turizm', 'otel', 'tatil', 'seyahat'],
    }),
  })
}
