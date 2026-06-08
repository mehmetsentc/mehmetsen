#!/usr/bin/env node
/** npm run newsroom-process-queue */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/process-queue')
