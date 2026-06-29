/**
 * 2026 FIFA Dünya Kupası Worker
 *
 * Kaynaklar:
 *   - sozcu-world-cup           Sözcü resmi dünya kupası kategori RSS'i
 *   - gnews-world-cup-tr        Google News — "2026 Dünya Kupası" araması
 *   - gnews-milli-takim-wc      Google News — "A Milli Takım" + "Dünya Kupası"
 *   - gnews-world-cup-results   Google News — maç sonucu / gol odaklı sorgu
 *
 * Tüm kaynaklar `dunya-kupasi-2026` kategorisine forced olarak yazılır,
 * ana feed'e düşmez. Worker dakikalar içinde sonuçlanmış maçlar ile ilgili
 * haberi yakalar ve özet/etiketle birlikte yayınlar.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runWorldCupWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: [
      'sozcu-world-cup',
      'gnews-world-cup-tr',
      'gnews-milli-takim-wc',
      'gnews-world-cup-results',
    ],
    editorId: 'world-cup-2026',
    editorType: 'national',
    // 60s'lik Vercel proxy timeout'a takılmamak için: her run en fazla
    // ~12 AI yeniden-yazımı yapsın. Geriye kalanlar bir sonraki cron'a kalır.
    maxAiCalls: 12,
    // Kaynak başına en fazla 4 öğe — Google News feed'leri zaten taze sıralı,
    // ilk 4 sonuç son birkaç saatin haberlerini içerir.
    maxItemsPerSource: 4,
    forcedCategoryId: 'dunya-kupasi-2026',
    enrichInput: () => ({
      extraTags: ['2026', 'dünya-kupası', 'fifa', 'world-cup', 'futbol', 'milli-takım'],
    }),
  })
}
