/**
 * Bilim & Teknoloji Worker (Sözcü)
 * AI sınıflandırıcı bilim/teknoloji arasında seçim yapar.
 * Başka kategori atanırsa 'teknoloji' kullanılır (fallback).
 * Ana feed veya diğer kategorilere düşmez.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runBilimTeknolojiWorker(): Promise<NewsroomRunResult> {
  // İki ayrı pass: bilim + teknoloji. URL-bazlı dedup aynı makaleyi iki kez kaydetmez.
  const [bilimResult, teknolojiResult] = await Promise.all([
    runRssEditor({
      sourceIds: ['sozcu-bilim-teknoloji'],
      editorId: 'bilim-teknoloji',
      editorType: 'national',
      maxAiCalls: 5,
      forcedCategoryId: 'bilim',
      enrichInput: () => ({
        extraTags: ['bilim', 'araştırma', 'keşif', 'uzay', 'fizik', 'kimya', 'biyoloji'],
      }),
    }),
    runRssEditor({
      sourceIds: ['sozcu-bilim-teknoloji'],
      editorId: 'bilim-teknoloji',
      editorType: 'national',
      maxAiCalls: 5,
      forcedCategoryId: 'teknoloji',
      enrichInput: () => ({
        extraTags: ['teknoloji', 'yapay-zeka', 'yazılım', 'donanım', 'internet', 'siber-güvenlik'],
      }),
    }),
  ])

  return {
    ...bilimResult,
    itemsNew: bilimResult.itemsNew + teknolojiResult.itemsNew,
    itemsSkipped: bilimResult.itemsSkipped + teknolojiResult.itemsSkipped,
    itemsFailed: bilimResult.itemsFailed + teknolojiResult.itemsFailed,
    sourcesChecked: Math.max(bilimResult.sourcesChecked, teknolojiResult.sourcesChecked),
    errors: [...bilimResult.errors, ...teknolojiResult.errors],
  }
}
