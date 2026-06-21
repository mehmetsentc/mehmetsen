/**
 * Sözcü Son Dakika Worker
 * Kaynak: Sözcü son-dakika RSS — her 10 dakikada bir.
 * rssEditor içindeki fetchArticleEnrichment sayfa içeriğini tam olarak çeker.
 * Sadece son-dakika kategorisine kaydeder.
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import { analyzeBreakingSignals } from '@/services/newsroom/breakingNewsEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export async function runSozcuBreakingWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: ['sozcu-son-dakika'],
    editorId: 'sozcu-breaking',
    editorType: 'breaking',
    maxAiCalls: 15,
    forcedCategoryId: 'son-dakika',
    isBreaking: true,
    enrichInput: (item) => {
      const signals = analyzeBreakingSignals(item.title, item.summary, item.publishedAt)
      return {
        priorityScore: Math.max(signals.priorityScore, 80),
        isBreaking: true,
        extraTags: ['son-dakika', 'sözcü'],
      }
    },
  })
}
