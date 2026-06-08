#!/usr/bin/env node
/** npm run newsroom-national-worker */
import { triggerNewsroom } from './newsroom-shared.mjs'

await triggerNewsroom('/api/cron/newsroom/national')
