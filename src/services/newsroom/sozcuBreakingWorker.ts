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
  // sozcu-son-dakika enabled:false — native feed engelli; cron no-op (kaynak açılınca tekrar çalışır)
  return runRssEditor({
    sourceIds: ['sozcu-son-dakika'],
    editorId: 'sozcu-breaking',
    editorType: 'breaking',
    maxAiCalls: 15,
    enrichInput: (item) => {
      const signals = analyzeBreakingSignals(item.title, item.summary, item.publishedAt)
      return {
        priorityScore: signals.priorityScore,
        isBreaking: signals.isBreaking,
        extraTags: ['sözcü'],
      }
    },
  })
}
