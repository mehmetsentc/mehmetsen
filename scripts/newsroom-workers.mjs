#!/usr/bin/env node
/** npm run newsroom-workers — run all autonomous workers + queue processor once */
import { triggerNewsroom } from './newsroom-shared.mjs'

const workers = [
  '/api/cron/newsroom/breaking',
  '/api/cron/newsroom/national',
  '/api/cron/newsroom/local',
  '/api/cron/newsroom/trend',
  '/api/cron/newsroom/influencer',
  '/api/cron/newsroom/process-queue',
]

for (const path of workers) {
  console.log(`\n=== ${path} ===`)
  await triggerNewsroom(path)
}
