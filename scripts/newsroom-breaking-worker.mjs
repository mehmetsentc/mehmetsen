#!/usr/bin/env node
/** npm run newsroom-breaking-worker */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/breaking')
