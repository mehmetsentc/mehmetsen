import { BREAKING_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { analyzeBreakingSignals } from '@/services/newsroom/breakingNewsEditor'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Breaking worker — 2 min cron, highest priority sources. */
export async function runBreakingWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'breaking-news',
    editorType: 'breaking',
    sourceIds: BREAKING_NEWS_SOURCE_IDS,
    enrichInput: (item) => {
      const signals = analyzeBreakingSignals(item.title, item.summary, item.publishedAt)
      return {
        priorityScore: signals.priorityScore,
        isBreaking: signals.isBreaking,
      }
    },
  })
}
