#!/usr/bin/env node
/** npm run newsroom-local-worker */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/local')
