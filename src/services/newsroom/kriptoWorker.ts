/**
 * Kripto Worker — RSS-based crypto news (30 min).
 * Sources: CoinDesk, CoinTelegraph, Kriptokoin.com, BtcHaber
 */
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export const KRIPTO_SOURCE_IDS = [
  'coindesk',
  'cointelegraph',
  'kriptokoin',
  'btchaber',
] as const

export async function runKriptoWorker(): Promise<NewsroomRunResult> {
  return runRssEditor({
    sourceIds: [...KRIPTO_SOURCE_IDS],
    editorId: 'kripto',
    editorType: 'national',
    maxAiCalls: 8,
    forcedCategoryId: 'kripto',
    enrichInput: () => ({
      extraTags: ['kripto', 'bitcoin', 'ethereum', 'blockchain', 'web3'],
    }),
  })
}
