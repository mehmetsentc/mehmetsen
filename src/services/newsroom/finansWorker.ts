/**
 * Finans Worker — RSS-based financial news (30 min).
 * Sources: BloombergHT, Dünya, Ekonomim, Para, Reuters Finance
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export const FINANS_SOURCE_IDS = [
  'bloomberght',
  'dunya-ekonomi',
  'ekonomim',
  'ntv-ekonomi',
  'haberturk-ekonomi',
] as const

export async function runFinansWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: [...FINANS_SOURCE_IDS],
    editorId: 'finans',
    editorType: 'national',
    maxAiCalls: 10,
    forcedCategoryId: 'ekonomi',
    enrichInput: () => ({
      extraTags: ['finans', 'ekonomi', 'borsa', 'piyasa'],
    }),
  })
}
