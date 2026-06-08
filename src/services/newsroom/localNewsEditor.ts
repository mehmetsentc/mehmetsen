import { LOCAL_NEWS_SOURCE_IDS, MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import { runRssEditor } from '@/services/newsroom/rssEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Yerel haber editörü — AA, DHA, İHA ve yerel kaynaklar (10 dk). */
export const localNewsEditor = {
  sourceIds: LOCAL_NEWS_SOURCE_IDS,

  async run(maxAiCalls = MAX_AI_CALLS_PER_EDITOR): Promise<NewsroomRunResult> {
    return runRssEditor({
      sourceIds: LOCAL_NEWS_SOURCE_IDS,
      editorId: 'local-news',
      editorType: 'local',
      forcedCategoryId: 'yerel-haber',
      maxAiCalls,
    })
  },
}
