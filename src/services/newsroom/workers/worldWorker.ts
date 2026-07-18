import { WORLD_NEWS_SOURCE_IDS } from '@/services/newsroom/config'
import { runRssWorker } from '@/services/newsroom/workers/baseWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/**
 * World news worker — Reuters, AP, Al Jazeera, Guardian, BBC World,
 * DW, Sky News, NYT World, Washington Post, France 24, Euronews TR.
 * Covers: wars, conflicts, diplomacy, global economy, disasters, intl relations.
 * Cron: every 5 min.
 */
export async function runWorldWorker(): Promise<NewsroomRunResult> {
  return runRssWorker({
    workerId: 'world-news',
    editorType: 'national',
    sourceIds: WORLD_NEWS_SOURCE_IDS,
    // Hint only: categoryEngine.validate can reclassify TR domestic gezi/plaj
    // stories that Euronews etc. publish alongside real world news.
    forcedCategoryId: 'dunya',
    enrichInput: () => ({
      // Do not stamp "uluslararası/dış-politika" on every item — those tags
      // mislabel Turkish domestic pieces that ride the same RSS feed.
      extraTags: ['dünya'],
    }),
  })
}
