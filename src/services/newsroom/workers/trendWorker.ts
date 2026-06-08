import { trendEditor } from '@/services/newsroom/trendEditor'
import type { NewsroomRunResult } from '@/services/newsroom/types'

/** Trend worker — Google Trends + AI, 15 min cron (enhanced scaffold). */
export async function runTrendWorker(): Promise<NewsroomRunResult> {
  return trendEditor.run()
}
