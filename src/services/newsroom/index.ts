/**
 * AI Newsroom orchestrator — coordinates all editors and the shared pipeline.
 *
 * Workflow:
 *   Source → editor → factChecker → categoryEngine → geoEngine
 *   → newsDrafts (pending) OR auto-publish if confidenceScore >= threshold
 */
import { EDITOR_REGISTRY, NEWSROOM_AUTO_PUBLISH_THRESHOLD } from '@/services/newsroom/config'
import { breakingNewsEditor } from '@/services/newsroom/breakingNewsEditor'
import { localNewsEditor } from '@/services/newsroom/localNewsEditor'
import { trendEditor } from '@/services/newsroom/trendEditor'
import { influencerEditor } from '@/services/newsroom/influencerEditor'
import { eventEditor } from '@/services/newsroom/eventEditor'
import type { EditorId, NewsroomRunResult } from '@/services/newsroom/types'

export { runNewsroomIngest } from '@/services/newsroom/ingestRunner'
export { archiveEditor } from '@/services/newsroom/archiveEditor'
export { factChecker } from '@/services/newsroom/factChecker'
export { categoryEngine } from '@/services/newsroom/categoryEngine'
export { geoEngine } from '@/services/newsroom/geoEngine'
export { processNewsroomArticle } from '@/services/newsroom/pipeline'
export { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'
export * from '@/services/newsroom/workers'
export * from '@/services/newsroom/types'
export * from '@/services/newsroom/config'

const EDITORS = {
  'local-news': localNewsEditor,
  'breaking-news': breakingNewsEditor,
  trend: trendEditor,
  influencer: influencerEditor,
  event: eventEditor,
} as const

export type RunnableEditorId = keyof typeof EDITORS

export const newsroom = {
  registry: EDITOR_REGISTRY,
  autoPublishThreshold: NEWSROOM_AUTO_PUBLISH_THRESHOLD,

  editors: EDITORS,

  async run(editorId: RunnableEditorId): Promise<NewsroomRunResult> {
    const editor = EDITORS[editorId]
    if (!editor) {
      throw new Error(`Unknown runnable editor: ${editorId}`)
    }
    return editor.run()
  },

  listEditors(): EditorId[] {
    return Object.keys(EDITOR_REGISTRY) as EditorId[]
  },
}
