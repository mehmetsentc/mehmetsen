import { GUNDEM_SOURCE_IDS } from '@/services/newsroom/config'
import { analyzeBreakingSignals } from '@/services/newsroom/breakingNewsEditor'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * Gündem Bot — Google News TR + AA kategori feedleri.
 *
 * Strateji:
 * - editorType: 'national' → categoryEngine ulusal kapsam modunda çalışır
 * - forcedCategoryId yok → AI doğal kategori atar (siyaset, ekonomi, gündem vb.)
 * - maxAgeMs: 4 saat → eski haberler işlenmez
 * - enrichInput: breaking sinyalleri ekler — son-dakika kaliteli haberlerde tetiklenir
 *
 * Google News RSS: algoritmik filtreleme zaten ulusal gündem haberlerini öne çıkarır.
 * AA feedleri: birincil kaynak, yüksek güvenilirlik.
 */
export async function runGundemWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'gundem',
    editorType: 'national',
    sourceIds: GUNDEM_SOURCE_IDS,
    maxAgeMs: 4 * 60 * 60 * 1000, // Son 4 saatin haberleri
    enrichInput: (item) => {
      const signals = analyzeBreakingSignals(item.title, item.summary, item.publishedAt)
      return {
        priorityScore: signals.priorityScore,
        isBreaking: signals.isBreaking,
      }
    },
  })
}
