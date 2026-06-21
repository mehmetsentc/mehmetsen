export { runBreakingWorker } from '@/services/newsroom/workers/breakingWorker'
export { runNationalWorker } from '@/services/newsroom/workers/nationalWorker'
export { runLocalWorker } from '@/services/newsroom/workers/localWorker'
export { runTrendWorker } from '@/services/newsroom/workers/trendWorker'
export { runInfluencerWorker } from '@/services/newsroom/workers/influencerWorker'
export { runRssWorker } from '@/services/newsroom/workers/baseWorker'
export { runSportsWorker } from '@/services/newsroom/workers/sportsWorker'
export { runWorldWorker } from '@/services/newsroom/workers/worldWorker'
export { runTechWorker } from '@/services/newsroom/workers/techWorker'
export { runHealthWorker } from '@/services/newsroom/workers/healthWorker'
export { runPoliticsWorker } from '@/services/newsroom/workers/politicsWorker'
export { runMagazineWorker } from '@/services/newsroom/workers/magazineWorker'
export { runGundemWorker } from '@/services/newsroom/workers/gundemWorker'

import { runBreakingWorker } from '@/services/newsroom/workers/breakingWorker'
import { runNationalWorker } from '@/services/newsroom/workers/nationalWorker'
import { runLocalWorker } from '@/services/newsroom/workers/localWorker'
import { runTrendWorker } from '@/services/newsroom/workers/trendWorker'
import { runInfluencerWorker } from '@/services/newsroom/workers/influencerWorker'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'

export async function runAllNewsroomWorkers(): Promise<{
  breaking: Awaited<ReturnType<typeof runBreakingWorker>>
  national: Awaited<ReturnType<typeof runNationalWorker>>
  local: Awaited<ReturnType<typeof runLocalWorker>>
  trend: Awaited<ReturnType<typeof runTrendWorker>>
  influencer: Awaited<ReturnType<typeof runInfluencerWorker>>
  queue: Awaited<ReturnType<typeof processNewsQueue>>
}> {
  const breaking = await runBreakingWorker()
  const national = await runNationalWorker()
  const local = await runLocalWorker()
  const trend = await runTrendWorker()
  const influencer = await runInfluencerWorker()
  const queue = await processNewsQueue()
  return { breaking, national, local, trend, influencer, queue }
}
