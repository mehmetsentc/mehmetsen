import { influencerEditor } from '@/services/newsroom/influencerEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Influencer worker — configured celebrity desk, 30 min cron. */
export async function runInfluencerWorker(): Promise<NewsroomRunResult> {
  return influencerEditor.run()
}
